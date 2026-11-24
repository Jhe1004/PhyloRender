const test = require('node:test');
const assert = require('node:assert/strict');
require('../figure-units.js');
const numericControls = require('../ui/numeric-controls.js');
const importState = require('../ui/import-state.js');
const documentState = require('../core/document-state.js');
const identity = require('../core/sample-identity.js');
const operations = require('../core/sample-name-state.js');
const sampleNamesWorkbench = require('../ui/sample-names.js');
const conflict = require('../conflict-tree.js');

function createFakeDom() {
  const byId = new Map();
  class FakeElement {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.listeners = new Map();
      this.attrs = {};
      this.dataset = {};
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.hidden = false;
      this.parentNode = null;
      this.parentElement = null;
      this.nextSibling = null;
      this.ownerDocument = fakeDom;
      const classes = new Set();
      this.classList = {
        add: (...xs) => xs.forEach(x => classes.add(x)),
        remove: (...xs) => xs.forEach(x => classes.delete(x)),
        toggle: (x, on) => (on ? classes.add(x) : classes.delete(x)),
        contains: x => classes.has(x),
      };
      this.style = { setProperty: () => {} };
      this._id = '';
      this._validationMessage = '';
      this.reportedValidity = false;
    }
    set id(v) { this._id = v; if (v) byId.set(v, this); }
    get id() { return this._id; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k]; }
    addEventListener(type, cb) {
      const list = this.listeners.get(type) || [];
      list.push(cb);
      this.listeners.set(type, list);
    }
    removeEventListener(type, cb) {
      this.listeners.set(type, (this.listeners.get(type) || []).filter(fn => fn !== cb));
    }
    dispatchEvent(evt) {
      const list = this.listeners.get(evt.type) || [];
      for (const fn of list) fn({ target: this, preventDefault() {}, stopPropagation() {}, ...evt });
      return true;
    }
    append(...nodes) {
      for (const n of nodes) {
        if (typeof n === 'object' && n) { n.parentNode = this; n.parentElement = this; }
        this.children.push(n);
      }
    }
    after(...nodes) {
      for (const n of nodes) {
        if (typeof n === 'object' && n) { n.parentNode = this.parentNode; n.parentElement = this.parentElement; }
      }
    }
    insertBefore(newNode, refNode) {
      newNode.parentNode = this;
      newNode.parentElement = this;
      const idx = this.children.indexOf(refNode);
      if (idx >= 0) this.children.splice(idx, 0, newNode);
      else this.children.push(newNode);
    }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    closest() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    setCustomValidity(msg) { this._validationMessage = String(msg || ''); }
    reportValidity() { this.reportedValidity = true; return !this._validationMessage; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    focus() { this.focused = true; }
    select() {}
  }
  const fakeDom = {
    createElement: tag => new FakeElement(tag),
    getElementById: id => byId.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return { fakeDom, FakeElement };
}

test('compactRange allows keyboard clearing and multi-digit typing without premature clamping', () => {
  const { fakeDom } = createFakeDom();
  const makeRange = (id, min, max, step, val) => {
    const r = fakeDom.createElement('input');
    r.id = id; r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(val);
    return r;
  };
  for (const id of ['support-decimals-range', 'support-threshold', 'cloud-opacity', 'cloud-jitter',
    'cloud-pie-radius', 'cloud-pie-legend-scale', 'time-hpd-opacity', 'time-hpd-thickness']) {
    makeRange(id, id === 'cloud-pie-legend-scale' ? 75 : 0, id === 'cloud-pie-legend-scale' ? 200 : 100, 1,
      id === 'cloud-pie-legend-scale' ? 150 : 50);
  }
  const thresh = fakeDom.createElement('input');
  thresh.id = 'cloud-phyparts-threshold';
  const threshParent = fakeDom.createElement('div');
  threshParent.append(thresh);

  numericControls.configure({
    dom: fakeDom,
    configs: [],
    pointIds: new Set(),
    timeTypes: [],
    timeFallback: {},
  });

  const number = fakeDom.getElementById('cloud-pie-legend-scale-number');
  const range = fakeDom.getElementById('cloud-pie-legend-scale');
  assert.equal(number.value, '150');

  // Clear input: must stay empty during typing
  number.value = '';
  number.dispatchEvent(new Event('input'));
  assert.equal(number.value, '', 'clearing input during typing must not immediately refill 150');

  // Type multi-digit 1 -> 12 -> 120 (min is 75)
  number.value = '1';
  number.dispatchEvent(new Event('input'));
  assert.equal(number.value, '1', 'typing first digit "1" for 120 must not be clamped to 75');

  number.value = '12';
  number.dispatchEvent(new Event('input'));
  assert.equal(number.value, '12', 'typing "12" for 120 must not be clamped to 75');

  number.value = '120';
  number.dispatchEvent(new Event('input'));
  assert.equal(number.value, '120');
  assert.equal(range.value, '120');

  number.dispatchEvent(new Event('change'));
  assert.equal(number.value, '120');
  assert.equal(range.value, '120');
});

test('importState.restore restores DOM control values BEFORE calling sync() and details.open AFTER sync()', async () => {
  let value = 'initial';
  const control = {
    get value() { return value; },
    set value(v) { value = v; },
    checked: false,
    disabled: false,
    tagName: 'SELECT',
    innerHTML: '<option value="initial"></option><option value="dirty"></option>',
  };
  const detail = { open: true };
  let seenInSync = null;
  const mgr = importState.create({
    captureModel: () => ({ a: 1 }),
    restoreModel: () => {},
    readControls: () => [control],
    readDetails: () => [detail],
    readLabels: () => [],
    captureExtra: () => null,
    restoreExtra: () => {},
    sync: () => { seenInSync = control.value; detail.open = false; },
    redraw: async () => {},
  });
  const snap = mgr.capture();
  control.value = 'dirty';
  detail.open = false;
  await mgr.restore(snap);
  assert.equal(seenInSync, 'initial');
  assert.equal(detail.open, true);
});

test('createDocument declares all conflict and cloud fields upfront', () => {
  const doc = documentState.createDocument();
  assert.ok(Object.hasOwn(doc.conflict, 'nuclearText'));
  assert.ok(Object.hasOwn(doc.conflict, 'plastidText'));
  assert.ok(Object.hasOwn(doc.cloud, 'speciesText'));
  assert.ok(Object.hasOwn(doc.cloud, 'treePLSeed'));
  assert.ok(Object.hasOwn(doc.cloud, 'treePLRuns'));
});

test('sampleNamesWorkbench preserves follow checkbox, supports conflict dblclick, and reports dialog validation inline', async () => {
  const { fakeDom, FakeElement } = createFakeDom();
  const elements = {};
  for (const name of ['select', 'list', 'status', 'clear', 'edit', 'mappingFile', 'template', 'original', 'input',
    'restore', 'dialog', 'form', 'cancel', 'svg', 'family', 'color', 'size', 'bold', 'italic', 'normalize', 'follow',
    'rankStatus', 'taxonStatus']) {
    elements[name] = new FakeElement('div');
  }
  elements.follow.checked = true;
  elements.family.value = 'Arial';
  elements.size.value = '20';
  let overrides = new Map();
  let pending = null;
  const names = operations.create({
    identity,
    readOriginals: () => ['Taxon_A'],
    readOverrides: () => overrides,
    replaceOverrides: v => { overrides = v; },
    invalidateRecognition: () => {},
    readPending: () => pending,
    writePending: v => { pending = v; },
    invalidateAllRecognition: () => {},
  });
  const calls = [];
  const api = sampleNamesWorkbench.create({
    elements,
    names,
    createElement: tag => fakeDom.createElement(tag),
    baseLabel: identity.baseTipDisplayLabel,
    displayLabel: raw => overrides.get(raw) || identity.baseTipDisplayLabel(raw),
    syncTipSize: () => {},
    renderTree: () => calls.push('render'),
    recognize: () => calls.push('recognize'),
    requestSettingsRender: () => calls.push('settings'),
    showMessage: (...a) => calls.push(['msg', ...a]),
    parseMappingFile: async () => ({}),
    downloadTemplate: () => {},
    deferFocus: fn => fn(),
    canRenameFromFigure: () => true,
  });
  api.bind();

  // follow presentation capture/restore
  const pres = api.capturePresentation();
  elements.follow.checked = false;
  api.restorePresentation(pres);
  assert.equal(elements.follow.checked, true);

  // conflict-tip-label dblclick
  const conflictTarget = {
    closest: selector => selector.includes('conflict-tip-label') ? { getAttribute: () => 'Taxon_A' } : null,
  };
  await elements.svg.dispatchEvent({ type: 'dblclick', target: conflictTarget });
  assert.equal(elements.dialog.open, true);
  assert.equal(names.pending(), 'Taxon_A');

  // inline error reporting in dialog submit
  elements.input.value = '   ';
  await elements.form.dispatchEvent({ type: 'submit' });
  assert.equal(elements.dialog.open, true);
  assert.ok(elements.input._validationMessage.length > 0, 'invalid tip rename should set customValidity on input');
  assert.equal(elements.input.reportedValidity, true);
});

test('conflict equal-count distinct-sample trees accept explicit intersection/union policy instead of deadlocking', () => {
  const left = { id: 'r1', label: '', length: 0, children: [
    { id: 'a', label: 'A', length: 1, children: [] },
    { id: 'b', label: 'B', length: 1, children: [] },
    { id: 'x', label: 'Only_Left', length: 1, children: [] },
  ] };
  const right = { id: 'r2', label: '', length: 0, children: [
    { id: 'a2', label: 'A', length: 1, children: [] },
    { id: 'b2', label: 'B', length: 1, children: [] },
    { id: 'y', label: 'Only_Right', length: 1, children: [] },
  ] };
  assert.throws(() => conflict.prepareConflictTrees(left, right, ''), err => err.code === 'CONFLICT_EQUAL_COUNT_NAME_MISMATCH');
  const prepared = conflict.prepareConflictTrees(left, right, 'intersection');
  assert.equal(prepared.comparison.sharedCount, 2);
});

test('sampleIdentity conflict policy trims trailing underscore spaces', () => {
  assert.equal(identity.tipIdentityKey('Sample_1_', 'conflict'), 'sample 1');
  assert.equal(identity.tipIdentityKey('_Sample_1_', 'conflict'), 'sample 1');
});
