import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRuntime } from '../src/runtime.mjs';

const runtime = await createRuntime();
const evidence = process.argv[2];
const audit = [];
try {
  if (evidence) await mkdir(evidence, { recursive: true });
  const page = await runtime.renderer.browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(runtime.renderer.agentPageUrl);
  await page.evaluate(() => PhyloRenderAgent.ready());

  // Two obsolete time-caption editors are hidden; the common node-radius
  // editor is now included. All current drawing dimensions retain an editor.
  assert.equal(await page.locator('.compact-numeric-stepper').count(), 26);
  for(const id of ['node-radius-number','time-period-size-number','time-epoch-size-number','time-axis-size-number','time-unit-size-number'])
    assert.equal(await page.locator(`.compact-numeric-stepper #${id}`).count(),1);
  assert.equal(await page.locator('.help-note-icon').evaluateAll(nodes => nodes.every(node => node.textContent === '?')), true);
  assert.equal(await page.locator('.controls input[type="range"]:visible').count(), 0);

  for (const id of ['cloud-opacity', 'cloud-jitter', 'cloud-pie-radius', 'time-hpd-opacity', 'time-hpd-thickness']) {
    await page.locator(`[data-workspace-mode="${id.startsWith('cloud-') ? 'cloud' : 'time'}"]`).click();
    const range = page.locator(`#${id}`);
    const number = page.locator(`#${id}-number`);
    assert.equal(await range.isVisible(), false, `${id} backing range hidden`);
    assert.equal(await number.count(), 1, `${id} has one direct input`);
    const before = Number(await number.inputValue());
    const step = Number(await number.getAttribute('step'));
    await page.evaluate(id => {
      const input = document.getElementById(`${id}-number`);
      const details = input.closest('details');
      if (details) details.open = true;
      const pageName = input.closest('[data-settings-page]')?.dataset.settingsPage;
      if (pageName) document.querySelector(`[data-settings-target="${pageName}"]`)?.click();
    }, id);
    await page.evaluate(id => document.getElementById(`${id}-number-increase`).click(), id);
    assert.ok(Math.abs(Number(await number.inputValue()) - before - step) < 1e-8, `${id} plus`);
    await page.evaluate(id => document.getElementById(`${id}-number-decrease`).click(), id);
    assert.ok(Math.abs(Number(await number.inputValue()) - before) < 1e-8, `${id} minus`);
  }

  const modes = ['phylogeny', 'time', 'cloud', 'conflict'];
  for (const mode of modes) {
    await page.locator(`[data-workspace-mode="${mode}"]`).click();
    const pages = await page.locator('.settings-nav [data-settings-target]:visible').evaluateAll(nodes => nodes.map(node => node.dataset.settingsTarget));
    for (const settingsPage of pages) {
      await page.locator(`[data-settings-target="${settingsPage}"]`).click();
      await page.locator(`.settings-group[data-settings-page="${settingsPage}"]:visible`).evaluateAll(nodes => nodes.forEach(node => { if (node.tagName === 'DETAILS') node.open = true; }));
      const state = await page.evaluate(() => {
        const visible = element => {
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
        };
        const ranges = [...document.querySelectorAll('.controls input[type="range"]')].filter(visible).map(input => input.id);
        const orphanNumbers = [...document.querySelectorAll('.controls input[type="number"]')].filter(visible)
          .filter(input => !input.closest('.compact-numeric-stepper') && !input.closest('.time-age-range-input') && input.id !== 'cloud-root-age')
          .map(input => input.id);
        const oldHelp = [...document.querySelectorAll('.help-note-icon')].filter(visible).filter(icon => icon.textContent !== '?').map(icon => icon.textContent);
        const steppers = [...document.querySelectorAll('.compact-numeric-stepper')].filter(visible)
          .map(element => ({ height: element.getBoundingClientRect().height, children: [...element.children].filter(visible).map(child => child.tagName) }));
        return { ranges, orphanNumbers, oldHelp, steppers };
      });
      assert.deepEqual(state.ranges, [], `${mode}/${settingsPage}: no visible sliders`);
      assert.deepEqual(state.orphanNumbers, [], `${mode}/${settingsPage}: no inconsistent bounded number inputs`);
      assert.deepEqual(state.oldHelp, [], `${mode}/${settingsPage}: help icons are question marks`);
      for (const stepper of state.steppers) {
        assert.deepEqual(stepper.children, ['BUTTON', 'INPUT', 'BUTTON']);
        assert.ok(stepper.height >= 34 && stepper.height <= 37, `${mode}/${settingsPage}: one control height`);
      }
      audit.push({ mode, settingsPage, ...state });
    }
  }

  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('[data-workspace-mode="time"]').click();
    await page.locator('[data-settings-target="tree"]').click();
    await page.locator('#tip-layout-settings > summary').click();
    assert.equal(await page.locator('#tip-spacing-number').isVisible(), true);
    assert.equal(await page.locator('#tree-horizontal-scale-number').isVisible(), true);
    if (evidence) await page.screenshot({ path: `${evidence}/ui-${width}.png`, fullPage: false });
  }

  assert.deepEqual(errors, []);
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await writeFile(`${evidence}/audit.json`, JSON.stringify({ compactSteppers: 26, audit, errors }, null, 2));
  }
  console.log(`PASS ${audit.length} workspace/page combinations, 26 compact numeric editors, five converted range controls, unified help affordances and 1440/820/390 viewports`);
} finally {
  await runtime.close();
}
