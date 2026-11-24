const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
test('scale bar stays compact, preserves distance conversion and separates ink from ticks', () => {
  for (const plotWidth of [100, 600, 2000, 6000]) for (const maxDistance of [.0003, .1, 2, 100]) for (const ascent of [8, 20, 40]) {
    const children = [];
    const context = vm.createContext({ svgEl: (tag, attrs, text) => ({tag, attrs, text, getBBox: () => ({y: -ascent}), setAttribute(k,v) { this.attrs[k] = v; }}) });
    vm.runInContext(source.slice(source.indexOf('function drawScaleBar('), source.indexOf('const MAX_PHYLOGENY_LABEL_EDGE_DISTANCE')), context);
    context.drawScaleBar({append: el => children.push(el)}, {maxDistance}, plotWidth, 1000);
    const [line, , tick, label] = children;
    const length = line.attrs.x2 - line.attrs.x1;
    assert.ok(length > 0 && length <= 250.000001);
    const raw = maxDistance * Math.min(100, plotWidth * .12) / plotWidth;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const oldValue = Math.max(...[1, 2, 5, 10].map(n => n * magnitude).filter(n => n <= raw * (1 + 1e-12)));
    assert.ok(Math.abs(length / (oldValue / maxDistance * plotWidth) - 2.5) < 1e-10);
    assert.ok(Math.abs(length / plotWidth * maxDistance - Number(label.text)) < maxDistance * 1e-10);
    assert.equal(line.attrs.y1, 960);
    assert.ok(label.attrs.y - ascent - tick.attrs.y2 >= 7);
  }
});
