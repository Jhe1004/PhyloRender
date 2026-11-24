import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { chromium } from "playwright";
import { figureSpecSchema } from "../src/schemas.mjs";
import { findBrowserExecutable } from "../src/runtime.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pageUrl = `${pathToFileURL(path.join(projectRoot, "index.html"))}?phylorender-agent=1`;
const tree = `((A:4000000,B:4000000)[&height=4000000,height_mean=5000000,height_median=4500000,height_95%_HPD={3000000,6000000}]:6000000,(C:3000000,D:3000000)[&height=3000000,height_mean=3400000,height_median=3200000,height_95%_HPD={2000000,5000000}]:7000000)[&height=10000000,height_mean=11000000,height_median=10500000,height_95%_HPD={9000000,12000000}];`;
const supportedTree = `((A:4000000,B:4000000)[&height=4000000,posterior=0.97]:6000000,(C:3000000,D:3000000)[&height=3000000,posterior=1]:7000000)[&height=10000000,posterior=1];`;

const browser = await chromium.launch({ headless: true,
  executablePath: await findBrowserExecutable() });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(pageUrl, { waitUntil: "load" });
  await page.evaluate(() => window.PhyloRenderAgent.ready());
  await page.evaluate(() => switchWorkspaceMode("time"));

  const unconfirmed = await page.evaluate(async content => {
    const figure = await window.PhyloRenderAgent.loadFigure({ main_tree: { name: "date-years.tree", content } });
    return {
      time: figure.report.time,
      safe: figure.report.safe_for_export,
      warnings: figure.report.warnings,
      axisUnit: document.querySelector(".time-axis-bottom .time-axis-unit")?.textContent,
      geology: document.querySelectorAll(".time-geology").length,
      svg: figure.svg,
    };
  }, tree);
  assert.equal(unconfirmed.time.unit_confirmed, false);
  assert.equal(unconfirmed.safe, false);
  assert.match(unconfirmed.axisUnit, /unconfirmed/);
  assert.equal(unconfirmed.geology, 0);
  assert.doesNotMatch(unconfirmed.svg, /Million years ago \(Mya\)/);

  const supportSuppressed = await page.evaluate(async content => {
    const figure = await window.PhyloRenderAgent.loadFigure({
      workspace: "time",
      main_tree: { name: "supported-dating.tree", content },
      options: { time: { source_unit: "years", display_unit: "mya" } },
    });
    const svg = document.querySelector("#tree-svg");
    return {
      labels: [...svg.querySelectorAll(".time-age-label")].map(node => node.textContent),
      fullBranches: svg.querySelectorAll(".full-support-branch").length,
      supportAttributes: svg.querySelectorAll("[data-support-state],[data-support-branch]").length,
      supportUploadVisible: !document.querySelector(".support-data-card").hidden,
      supportRulesVisible: !document.querySelector("details:has(#full-support-style)").hidden,
      branchReport: figure.report.branches.map(branch => ({
        main_support: branch.main_support,
        displayed_annotation: branch.displayed_annotation,
      })),
      exported: figure.svg,
    };
  }, supportedTree);
  assert.ok(supportSuppressed.labels.every(label => !/0\.97|1\.0/.test(label)));
  assert.equal(supportSuppressed.fullBranches, 0);
  assert.equal(supportSuppressed.supportAttributes, 0);
  assert.equal(supportSuppressed.supportUploadVisible, false);
  assert.equal(supportSuppressed.supportRulesVisible, false);
  assert.ok(supportSuppressed.branchReport.every(branch => branch.main_support === null));
  assert.ok(supportSuppressed.branchReport.every(branch => !["0.97", "1.0"].includes(branch.displayed_annotation)));
  assert.doesNotMatch(supportSuppressed.exported, /full-support-branch|data-support-state|data-support-branch/);
  assert.equal(figureSpecSchema.safeParse({
    workspace: "time",
    main_tree: { name: "supported-dating.tree", content: supportedTree },
    support_trees: [{ name: "bootstrap.tree", content: "((A,B)88,(C,D)77);" }],
  }).success, false);

  const spec = figureSpecSchema.parse({
    workspace: "time",
    main_tree: { name: "date-years.tree", content: tree },
    clades: [{ name: "AB", mrca_of: ["A", "B"], color: "#5f72a5" }],
    options: { time: {
      source_unit: "years", display_unit: "mya", age_source: "height_mean",
      show_hpd: true, hpd_scope: "named_clades", hpd_marker: "height_median",
      hpd_color: "#123456", hpd_opacity: .65, hpd_thickness: 10,
    } },
  });
  const configured = await page.evaluate(async input => {
    const figure = await window.PhyloRenderAgent.loadFigure(input);
    const svg = document.querySelector("#tree-svg");
    const bar = svg.querySelector(".time-hpd");
    const marker = svg.querySelector(".time-hpd-point");
    const labels = [...svg.querySelectorAll(".time-age-label")].map(node => node.textContent);
    return {
      time: figure.report.time,
      safe: figure.report.safe_for_export,
      warnings: figure.report.warnings,
      normalized: figure.normalized_spec.options.time,
      axisUnit: svg.querySelector(".time-axis-bottom .time-axis-unit")?.textContent,
      axisTicks: [...svg.querySelectorAll(".time-axis-bottom .time-axis-label")].map(node => node.textContent),
      geology: svg.querySelectorAll(".time-geology").length,
      barCount: svg.querySelectorAll(".time-hpd").length,
      bar: bar && { fill: bar.getAttribute("fill"), opacity: bar.getAttribute("fill-opacity"), thickness: bar.getAttribute("height") },
      marker: marker && { statistic: marker.getAttribute("data-statistic"), age: marker.getAttribute("data-age") },
      labels,
      figureKeyCount: svg.querySelectorAll(".time-figure-key").length,
      exportedKey: figure.svg.includes("height_mean (posterior mean)"),
    };
  }, spec);
  assert.equal(configured.time.root_age_display, 11);
  assert.equal(configured.time.unit_confirmed, true);
  assert.equal(configured.time.invalid_age_nodes, 0);
  assert.equal(configured.time.mixed_explicit_age_sources, false);
  assert.ok(!configured.warnings.some(warning => /时间单位|节点的所选年龄|混用了/.test(warning)), JSON.stringify(configured.warnings));
  assert.equal(configured.time.age_source, "height_mean");
  assert.equal(configured.time.hpd_nodes_shown, 1);
  assert.equal(configured.time.hpd_markers_shown, 1);
  assert.equal(configured.barCount, 1);
  assert.deepEqual(configured.bar, { fill: "#123456", opacity: "0.65", thickness: "10" });
  assert.deepEqual(configured.marker, { statistic: "height_median", age: "4.5" });
  assert.equal(configured.axisUnit, "Million years ago (Mya)");
  assert.ok(configured.axisTicks.includes("10"));
  assert.ok(configured.geology > 0);
  assert.ok(configured.labels.includes("11.00"));
  assert.equal(configured.figureKeyCount, 0);
  assert.equal(configured.exportedKey, false);
  assert.equal(configured.normalized.hpd_scope, "named_clades");
  if (process.env.PHYLORENDER_TIME_PREVIEW) {
    await page.locator("#tree-svg").screenshot({ path: process.env.PHYLORENDER_TIME_PREVIEW });
  }
  assert.deepEqual(errors, []);
  console.log("PASS time units, age source, HPD styling/scope/marker, and export metadata");
} finally {
  await browser.close();
}
