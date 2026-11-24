const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const pageUrl = process.argv[2] || "http://127.0.0.1:8765/";
const requestPath = path.resolve(process.argv[3] || path.join(
  __dirname,
  "..",
  "01_重复定根问题复现_20260925",
  "02_复现资料解包",
  "25_PhyloRender重复定根防呆报告_20260925",
  "01_错误请求与输出",
  "05_可移植错误请求_含重复定根.json",
));

async function materializeTreeInput(entry, baseDirectory) {
  const filePath = path.resolve(baseDirectory, entry.file);
  const { file, ...rest } = entry;
  return {
    ...rest,
    name: rest.name || path.basename(filePath),
    content: await readFile(filePath, "utf8"),
  };
}

(async () => {
  const portable = JSON.parse(await readFile(requestPath, "utf8"));
  const baseDirectory = path.dirname(requestPath);
  const spec = {
    ...portable,
    main_tree: await materializeTreeInput(portable.main_tree, baseDirectory),
    support_trees: await Promise.all((portable.support_trees || [])
      .map(tree => materializeTreeInput(tree, baseDirectory))),
  };

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PHYLORENDER_BROWSER_EXECUTABLE
      || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  try {
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.PhyloRenderAgent?.version === "1.8.1");
    const result = await page.evaluate(async spec => {
      const first = await window.PhyloRenderAgent.loadFigure(spec);
      const second = await window.PhyloRenderAgent.loadFigure(spec);
      const genuinelyRerooted = await window.PhyloRenderAgent.loadFigure({
        ...spec,
        rooting: { outgroup: ["Azara dentata SRR12282399  consensus"] },
      });
      return {
        first: first.report,
        second: second.report,
        genuinelyRerooted: genuinelyRerooted.report,
        firstSvg: first.svg,
        secondSvg: second.svg,
      };
    }, spec);

    for (const report of [result.first, result.second]) {
      assert.equal(report.tips, 99);
      assert.equal(report.rendered_node_annotations, 96);
      assert.equal(report.topology_unchanged, true);
      assert.equal(report.rooting.operation, "noop");
      assert.equal(report.rooting.input_already_matches, true);
      assert.equal(report.rooting.artificial_nodes_added, 0);
      assert.deepEqual(report.rooting.input_root_partition_tip_counts.slice().sort((a, b) => a - b), [1, 98]);
      assert.equal(report.warnings.some(message => message.includes("跳过重复定根")), true);
    }
    assert.equal(result.first.original_topology_fingerprint, result.second.original_topology_fingerprint);
    assert.equal(result.first.displayed_topology_fingerprint, result.second.displayed_topology_fingerprint);
    assert.equal(result.firstSvg, result.secondSvg);
    assert.equal(result.genuinelyRerooted.tips, 99);
    assert.equal(result.genuinelyRerooted.topology_unchanged, true);
    assert.equal(result.genuinelyRerooted.rooting.operation, "reroot");
    assert.equal(result.genuinelyRerooted.rooting.input_already_matches, false);
    assert.equal(result.genuinelyRerooted.rooting.artificial_nodes_added, 1);

    console.log(JSON.stringify({
      bridgeVersion: result.first.bridge_version,
      tips: result.first.tips,
      renderedNodeAnnotations: result.first.rendered_node_annotations,
      rootPartitionTipCounts: result.first.rooting.input_root_partition_tip_counts,
      rootingOperation: result.first.rooting.operation,
      inputAlreadyMatches: result.first.rooting.input_already_matches,
      artificialNodesAdded: result.first.rooting.artificial_nodes_added,
      topologyFingerprint: result.first.displayed_topology_fingerprint,
      repeatRenderIdentical: result.firstSvg === result.secondSvg,
      differentOutgroupOperation: result.genuinelyRerooted.rooting.operation,
      differentOutgroupTopologyUnchanged: result.genuinelyRerooted.topology_unchanged,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
