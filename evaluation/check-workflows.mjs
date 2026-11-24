// Repeatable engineering validation of imports, exports and configuration replay.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {readCases,bundleFingerprint} from './verify-cases.mjs';
import {createRuntime} from '../mcp-server/src/runtime.mjs';

if (!process.argv[2]) throw Error('Provide a NEW private output directory');
const output = path.resolve(process.argv[2]);
await mkdir(output, {recursive:false, mode:0o700});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cases = await readCases(), rows = [];
const bundle = await bundleFingerprint();
await writeFile(path.join(output,'bundle-manifest.json'),JSON.stringify(bundle,null,2));
let runtime;
try {
  runtime = await createRuntime();
  for (const item of cases) {
    const directory = path.join(output, item.id);
    await mkdir(directory);
    const request = structuredClone(item.spec);
    if (item.id === 'ordinary-58') request.tip_label_overrides = {Taxon_001:'Sample one'};
    await writeFile(path.join(directory, 'request.json'), JSON.stringify(request, null, 2));
    const row = {task_id:item.id, actor_kind:'scripted_engineering_check',
      started_utc:new Date().toISOString(), success:false};
    const start = performance.now();
    try {
      const result = await runtime.renderer.render(request, {formats:['svg','png']});
      await writeFile(path.join(directory, 'figure.svg'), result.svg);
      await writeFile(path.join(directory, 'figure.png'), result.png);
      await writeFile(path.join(directory, 'report.json'), JSON.stringify(result.report, null, 2));
      await writeFile(path.join(directory, 'normalized-settings.json'), JSON.stringify(result.normalizedSpec, null, 2));
      assert.equal(result.report.topology_unchanged, true);
      assert.equal(result.report.tips, Number(item.id.split('-')[1]));
      assert.equal(result.report.output.drawing_width, 1000);
      const viewBox = result.svg.match(/\bviewBox="([^"]+)"/);
      assert.ok(viewBox);
      assert.equal(Number(viewBox[1].trim().split(/\s+/)[2]), 1000);
      assert.ok(result.png.length > 100);
      const saved = JSON.parse(await readFile(path.join(directory, 'request.json'), 'utf8'));
      const replay = await runtime.renderer.render(saved, {formats:['svg','png']});
      assert.equal(replay.svg, result.svg, 'full SVG bytes, including provenance, must replay exactly');
      assert.equal(hash(replay.png), hash(result.png));
      assert.deepEqual(saved, request);
      Object.assign(row, {success:true, svg_sha256:hash(result.svg), png_sha256:hash(result.png),
        input_spec_sha256:hash(await readFile(path.join(directory,'request.json'))), config_replay_svg_png_exact:true,
        build_id:result.report.provenance?.build?.build_id || null});
    } catch (error) {
      row.error = {code:error.code || null, name:error.name, message:error.message};
      throw error;
    } finally {
      row.elapsed_seconds = (performance.now() - start) / 1000;
      rows.push(row);
      await writeFile(path.join(output, 'attempts.json'), JSON.stringify({
        validation_scope:"engineering", task_bundle_sha256:bundle.sha256, browser:runtime.renderer.browser.version(),
        platform:process.platform, node:process.version, cases:rows}, null, 2));
    }
  }
  console.log(JSON.stringify({engineering_cases_passed:rows.length,
    validation_scope:"engineering", output}));
} catch (error) {
  await writeFile(path.join(output, 'run-error.json'), JSON.stringify({name:error.name,
    code:error.code || null, message:error.message, recorded_utc:new Date().toISOString()}, null, 2));
  throw error;
} finally {
  await runtime?.close();
}
