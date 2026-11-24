import os from 'node:os';
import assert from "node:assert/strict";
import { selectHistoricalConsensus } from './select-historical-consensus.mjs';
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createRuntime } from "../src/runtime.mjs";
import { loadFullOrdinaryFixture } from './full-ordinary-fixture.mjs';
import contract from '../../figure-contract.js';

const runtime = await createRuntime();
const output = os.tmpdir() + '/phylorender-readable-layout';
await mkdir(output, { recursive: true });
try {
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1600, height: 1100 } });
  await loadFullOrdinaryFixture(page, runtime);
  await page.evaluate(async () => {
    await window.PhyloRenderEnsureFonts();
    await renderTree({ fontReady: true });
  });
  const defaults = await page.evaluate(() => window.PhyloRenderAgent.currentFigure());
  const defaultSpec = structuredClone(defaults.normalized_spec);
  delete defaultSpec.rooting;
  defaultSpec.main_tree = { name: "default.tre", content: selectHistoricalConsensus(await readFile(new URL("../../defaults/Raxml-Chloroplast.con.tre", import.meta.url), "utf8")) };
  defaultSpec.support_trees = [{ label: "Bootstrap", name: "default-bootstrap.tre", content:
    await readFile(new URL("../../defaults/RAxML_bipartitions.Raxml-Chloroplast", import.meta.url), "utf8") }];
  const reports = [];
  async function audit(name, requireClear = true) {
    const result = await page.evaluate(() => {
      const labels = [...document.querySelectorAll(".support-label, .time-age-label")];
      const gapLabel = labels.find(e => e.textContent === '0.6/63.0');
      const gapRoute = gapLabel ? {right:gapLabel.getBBox().x > +gapLabel.dataset.nodeX,
        crossings:+gapLabel.dataset.leaderPlanCrossings} : null;
      const tips = [...document.querySelectorAll(".tip-label")].map(element => element.getBBox());
      const arrows = [...document.querySelectorAll(".node-label-arrow")];
      const boxes = labels.map(element => ({ id: element.dataset.labelId, box: element.getBBox() }));
      const inkBoxes = labels.map(element => ({ id: element.dataset.labelId,
        box: nodeLabelInkRect(element, element.getBBox()) }));
      const branches = [...document.querySelectorAll('line.branch')].map(b => ({
        x1:+b.getAttribute('x1'), y1:+b.getAttribute('y1'), x2:+b.getAttribute('x2'), y2:+b.getAttribute('y2')}));
      const textBranchHits = boxes.filter(b => branches.some(s => segmentIntersectsRect(s, b.box, 3))).length;
      const textBranchIds = boxes.filter(b => branches.some(s => segmentIntersectsRect(s, b.box, 3))).map(b => b.id);
      const inkBranchIds = inkBoxes.filter(b => branches.some(s => segmentIntersectsRect(s, b.box, 1))).map(b => b.id);
      const overlaps = boxes.filter(a => boxes.some(b => a !== b && rectsOverlap(a.box, b.box, 1))
        || tips.some(tip => rectsOverlap(a.box, tip, 1))).map(item => item.id);
      const inkOverlaps = inkBoxes.filter(a => inkBoxes.some(b => a !== b && rectsOverlap(a.box, b.box, 1))
        || tips.some(tip => rectsOverlap(a.box, tip, 1))).map(item => item.id);
      const wrongTargets = arrows.filter(arrow => {
        const label = labels.find(element => element.dataset.labelId === arrow.dataset.leaderId);
        return !label || Math.hypot(Number(arrow.getAttribute("x2")) - Number(label.dataset.nodeX),
          Number(arrow.getAttribute("y2")) - Number(label.dataset.nodeY)) > .01;
      }).length;
      const pointerTextHits = arrows.flatMap(arrow => boxes.filter(box => box.id !== arrow.dataset.leaderId
        && segmentIntersectsRect({ x1: +arrow.getAttribute("x1"), y1: +arrow.getAttribute("y1"),
          x2: +arrow.getAttribute("x2"), y2: +arrow.getAttribute("y2") }, box.box, 1.5)));
      const pointerInkHits = arrows.flatMap(arrow => inkBoxes.filter(box => box.id !== arrow.dataset.leaderId
        && segmentIntersectsRect({ x1: +arrow.getAttribute("x1"), y1: +arrow.getAttribute("y1"),
          x2: +arrow.getAttribute("x2"), y2: +arrow.getAttribute("y2") }, box.box, 1.5)));
      const badTextAnchors = arrows.filter(arrow => {
        const label = labels.find(element => element.dataset.labelId === arrow.dataset.leaderId);
        const ink = nodeLabelInkRect(label, label.getBBox());
        const expected = leaderTargetCandidates({ x: +label.dataset.nodeX, y: +label.dataset.nodeY }, ink);
        return !expected.some(point => Math.hypot(point.x - +arrow.getAttribute("x1"), point.y - +arrow.getAttribute("y1")) < .01);
      }).length;
      const solidArrows = arrows.filter(arrow => getComputedStyle(arrow).strokeDasharray === "none").length;
      const crossingPairs = leaderCrossingPairs(arrows.map(a => ({labelId:a.dataset.leaderId,
        x1:+a.getAttribute('x1'), y1:+a.getAttribute('y1'), x2:+a.getAttribute('x2'), y2:+a.getAttribute('y2')}))).length;
      const invalidDetails = arrows.map(arrow => {
        const dx = Math.abs(+arrow.getAttribute("x2") - +arrow.getAttribute("x1"));
        const dy = Math.abs(+arrow.getAttribute("y2") - +arrow.getAttribute("y1"));
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        return { id: arrow.dataset.leaderId, angle, length: Math.hypot(dx, dy) };
      }).filter(item => item.length < 14 - .01 || item.angle < 20 - .01 || item.angle > 80 + .01);
      const invalidGeometry = invalidDetails.length;
      const longDashes = labels.filter(element => element.textContent.includes("—")).length;
      const joint = [...document.querySelectorAll('[data-joint-energy-before]')].map(g => ({
        before:+g.dataset.jointEnergyBefore, after:+g.dataset.jointEnergyAfter, pairs:+g.dataset.jointMoves }));
      return { labels: labels.length, minimum: Math.min(...labels.map(element => +element.getAttribute("font-size"))),
        floor: +$("support-min-size").value, collisions: +$("collision-count").textContent,
        arrows: arrows.length, enabled: $("leader-lines").checked, wrongTargets,
        overlaps, inkOverlaps, inkBranchIds, pointerTextHits: pointerTextHits.length,
        pointerInkHits: pointerInkHits.length,
        unplaced: [...document.querySelectorAll('.supports, .time-ages')]
          .reduce((sum, group) => sum + (+group.dataset.unplacedCount || 0), 0),
        badTextAnchors, solidArrows, invalidGeometry, invalidDetails, longDashes, crossingPairs, joint, textBranchHits, textBranchIds, gapRoute,
        relaxedOwnership: labels.filter(element => element.dataset.nodeOwnershipClear === "false").length,
        maxDistance: Math.max(...labels.map(element => +element.dataset.edgeDistance)),
        fractionalSizes: readableFontSizes(18.7, 17.3),
        diagonalMiss: segmentIntersectsRect({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x: 1, y: 8, width: 1, height: 1 }),
        diagonalHit: segmentIntersectsRect({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x: 4, y: 4, width: 2, height: 2 }),
      };
    });
    assert.ok(result.minimum + .001 >= result.floor, `${name}: readable font floor`);
    assert.equal(result.wrongTargets, 0, `${name}: every pointer ends at its true node`);
    assert.equal(result.badTextAnchors, 0, `${name}: text end attaches to visible glyphs, not the descender space`);
    assert.equal(result.solidArrows, 0, `${name}: dashed leaders by default`);
    assert.equal(result.longDashes, 0, `${name}: uniform short support dashes`);
    assert.ok(result.joint.every(j => Number.isFinite(j.after) && j.after <= j.before + 1e-6), `${name}: whole-layout objective cannot regress`);
    assert.equal(result.arrows, result.enabled ? result.labels : 0);
    assert.deepEqual(result.fractionalSizes, [18.7, 17.7, 17.3]);
    assert.equal(result.diagonalMiss, false);
    assert.equal(result.diagonalHit, true);
    console.log(JSON.stringify({name, labels:result.labels, unplaced:result.unplaced,
      collisions:result.collisions, inkOverlaps:result.inkOverlaps.length,
      inkBranchHits:result.inkBranchIds.length, pointerInkHits:result.pointerInkHits,
      crossingPairs:result.crossingPairs, advisoryGeometry:result.invalidGeometry,
      minimum:result.minimum, floor:result.floor}));
    if (requireClear) {
      assert.deepEqual(result.inkBranchIds, [], `${name}: painted digits must not cover branches`);
      assert.equal(result.crossingPairs, 0, `${name}: leaders should not cross each other`);
      assert.ok(result.invalidDetails.every(item => item.angle >= 0 && item.angle <= 90 && item.length > 0),
        `${name}: no degenerate leaders`);
      assert.equal(result.collisions, 0, `${name}: collision count`);
      assert.deepEqual(result.inkOverlaps, [], `${name}: painted glyphs do not overlap`);
      assert.equal(result.pointerInkHits, 0, `${name}: pointers must not hide painted digits`);
    }
    reports.push({ name, ...result });
  }
  await audit("default-173-tips");
  assert.deepEqual(reports.at(-1).gapRoute, {right:true,crossings:0}, 'use the clear right-hand gap rather than crossing basal branches');
  const rendered = await runtime.renderer.render(defaultSpec);
  console.log(JSON.stringify({renderedReport: {
    safe_for_export: rendered.report.safe_for_export,
    remaining_collisions: rendered.report.remaining_collisions,
    unplaced_count: rendered.report.label_layout?.unplaced_count,
    insufficient_angle: rendered.report.node_arrows?.insufficient_angle,
  }}));
  assert.equal(rendered.report.topology_unchanged, true);
  assert.equal(rendered.report.safe_for_export, true);
  await writeFile(`${output}/default.png`, rendered.png);
  await writeFile(`${output}/default.svg`, rendered.svg);
  for (const [name, preferred, minimum, arrows] of [
    ["large-equal-floor", 18, 18, true], ["fractional-font-floor", 18.7, 17.3, true],
    ["floor-above-preferred", 16, 18, true],
    ["arrows-disabled", 18, 16, false],
  ]) {
    await page.evaluate(async ({ preferred, minimum, arrows }) => {
      $("support-size").value = preferred;
      $("support-min-size").value = minimum;
      $("leader-lines").checked = arrows;
      await renderTree({ fontReady: true });
    }, { preferred, minimum, arrows });
    await audit(name, arrows);
  }
  await page.evaluate(async () => {
    $("leader-lines").checked = true;
    $("full-support-style").value = "number";
    await renderTree({ fontReady: true });
  });
  // Deliberately overcrowded mode: all 169 long compound values, unchanged
  // compact tip spacing. Readability and truthful warnings are mandatory;
  // arbitrary zero-collision claims are not. The new minimum leader length
  // and slope rule changes the feasible layout; compare hard constraints,
  // not a collision-count baseline from unrestricted horizontal leaders.
  await audit("all-support-values-visible", false);
  assert.ok(reports.at(-1).invalidDetails.every(item => item.angle >= 0 && item.angle <= 90 && item.length > 0),
    "dense mode must preserve nondegenerate leaders; angle and length are scored preferences");
  assert.ok(reports.at(-1).collisions >= reports.at(-1).inkOverlaps.length / 2,
    "unresolved overlaps must not be hidden from the report");
  if (reports.at(-1).collisions > 0 || reports.at(-1).unplaced > 0) {
    const current = await page.evaluate(() => window.PhyloRenderAgent.currentFigure());
    assert.equal(current.report.safe_for_export, false, "dense unresolved layouts must not be certified safe");
  }
  // The same repair pass must also work for dated trees; do not rely on an
  // external user's input file being installed on the test machine.
  const timeSpec = structuredClone(defaults.normalized_spec);
  timeSpec.workspace = "time";
  delete timeSpec.rooting;
  timeSpec.main_tree = { name: "dated-regression.tre", content:
    "(((((A:1,B:1)90:.1,C:1.1)80:.1,D:1.2)70:.1,E:1.3)60:8.7,(F:1,G:1)95:9);" };
  timeSpec.support_trees = [];
  timeSpec.options = contract.optionsForWorkspace("time", timeSpec.options);
  timeSpec.options.typography.nodes = { preferred_size_pt: 13.5, minimum_size_pt: 13.5 };
  timeSpec.options.labels.leader_lines = true;
  const datedResult = await page.evaluate(spec => window.PhyloRenderAgent.loadFigure(spec), timeSpec);
  assert.equal(datedResult.report.tree_type, "time");
  assert.equal(datedResult.report.time.root_age_raw, 10);
  await audit("dated-dense-nodes");
  await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2));
} finally { await runtime.close(); }
