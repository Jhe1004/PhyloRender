import assert from 'node:assert/strict';

// Production redraws are asynchronous. Wait for their actual owner and the
// deferred settings render; never read the previous SVG as the new result.
export async function settleFigure(page) {
  await page.waitForFunction(() => !activeTreeLoad, null, { timeout: 180000 });
  const flushed = await page.evaluate(() => flushSettingsRender());
  assert.equal(flushed, true, 'A settings redraw must succeed before geometry is audited');
  await page.waitForFunction(() => !activeTreeLoad && !settingsRenderPromise,
    null, { timeout: 180000 });
}
