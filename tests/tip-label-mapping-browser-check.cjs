const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const JSZip = require("jszip");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";

async function xlsxBuffer(rows) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="mapping" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`).join("")}</row>`).join("");
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

(async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "phylorender-tip-map-"));
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => typeof window.PhyloRenderAgent?.loadFigure === "function");
    const initial = await page.evaluate(() => window.PhyloRenderAgent.loadFigure({
      main_tree: { name: "names.tre", content: "((A_one:1,B_two:1)0.9:1,(C_three:1,D_four:2)0.8:1);" },
      support_trees: [{ name: "support.tre", content: "((B_two:1,A_one:1)88:1,(D_four:2,C_three:1)77:1);" }],
      rooting: { outgroup: ["A_one", "B_two"] },
      options: { layout: { mode: "aligned" } },
    }));
    const matchedSupports = initial.report.node_data_sources[0].matched_nodes;
    assert.ok(matchedSupports > 0);
    assert.equal(initial.report.topology_unchanged, true);

    await page.locator('.tip-rename-section summary').click();
    await page.selectOption("#tip-rename-select", "A_one");
    await page.click("#tip-rename-edit");
    await page.fill("#tip-rename-input", "Alpha specimen");
    await page.click("#tip-rename-form button[type=submit]");
    await page.waitForFunction(() => document.querySelector('.tip-label[data-original-tip-label="A_one"]')?.textContent === "Alpha specimen");

    const csv = path.join(temp, "mapping.csv");
    await writeFile(csv, "原始名称,显示名称\nB_two,Beta specimen\n", "utf8");
    await page.setInputFiles("#tip-label-map-file", csv);
    await page.waitForFunction(() => document.querySelector('.tip-label[data-original-tip-label="B_two"]')?.textContent === "Beta specimen");

    const xlsx = path.join(temp, "mapping.xlsx");
    await writeFile(xlsx, await xlsxBuffer([["original_name", "display_name"], ["C_three", "Gamma specimen"]]));
    await page.setInputFiles("#tip-label-map-file", xlsx);
    await page.waitForFunction(() => document.querySelector('.tip-label[data-original-tip-label="C_three"]')?.textContent === "Gamma specimen");

    const parserResult = await page.evaluate(() => {
      const mapping = window.PhyloRenderTipLabelMapping.rowsToMapping(
        window.PhyloRenderTipLabelMapping.parseDelimitedText("original\tdisplay\nD_four\tDelta specimen\n", "\t"),
      );
      applyTipLabelOverrides(mapping, { mode: "merge", message: false });
      return tipLabelOverridesObject();
    });
    assert.equal(parserResult.D_four, "Delta specimen");

    const beforeInvalid = await page.evaluate(() => tipLabelOverridesObject());
    const invalid = path.join(temp, "invalid.csv");
    await writeFile(invalid, "original,display\nA_one,Changed again\nUnknown_tip,Should fail\n", "utf8");
    await page.setInputFiles("#tip-label-map-file", invalid);
    await page.waitForFunction(() => document.querySelector("#message").classList.contains("error"));
    assert.deepEqual(await page.evaluate(() => tipLabelOverridesObject()), beforeInvalid, "invalid batch must be atomic");

    const final = await page.evaluate(() => window.PhyloRenderAgent.currentFigure());
    assert.deepEqual(final.normalized_spec.tip_label_overrides, {
      A_one: "Alpha specimen",
      B_two: "Beta specimen",
      C_three: "Gamma specimen",
      D_four: "Delta specimen",
    });
    assert.equal(final.report.tip_labels.customized, 4);
    assert.equal(final.report.tip_labels.total, 4);
    assert.equal(final.report.topology_unchanged, true);
    assert.equal(final.report.node_data_sources[0].matched_nodes, matchedSupports);
    assert.deepEqual(final.report.outgroup.sort(), ["A one", "B two"]);
    assert.match(final.svg, /Alpha specimen/);
    assert.match(final.svg, /data-original-tip-label="A_one"/);
    assert.doesNotMatch(final.svg, />A one</);

    await page.locator('[data-workspace-mode="time"]').click();
    await page.waitForFunction(() => state.workspaceMode === 'time' && !document.querySelector('#tree-loading:not([hidden])'));
    const timeFigure = await page.evaluate(() => window.PhyloRenderAgent.loadFigure({
      main_tree: { name: "time-names.tre", content: "((T_one:1,T_two:1):1,(T_three:1,T_four:1):1);" },
      tip_label_overrides: { T_one: "Time specimen 01" },
    }));
    assert.equal(timeFigure.report.tree_type, "time");
    assert.equal(timeFigure.report.tip_labels.customized, 1);
    assert.match(timeFigure.svg, /Time specimen 01/);

    console.log(JSON.stringify({
      bridgeVersion: final.report.bridge_version,
      customized: final.report.tip_labels.customized,
      csv: true,
      tsv: true,
      xlsx: true,
      invalidBatchAtomic: true,
      supportMatchingPreserved: true,
      topologyPreserved: true,
      timeTreeSupported: true,
    }, null, 2));
  } finally {
    await browser.close();
    await rm(temp, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
