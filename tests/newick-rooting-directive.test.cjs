const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../core/tree-input.js"), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const functionSource = name => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`))[0];
const context = vm.createContext({});
vm.runInContext([
  functionSource("extractLeadingRootingDirective"),
  functionSource("extractTreeSource"),
  functionSource("tokenizeNewick"),
  functionSource("parseNewick"),
].join("\n"), context);

function tipLabels(root) {
  const labels = [];
  (function visit(node) {
    if (!node.children.length) labels.push(node.label);
    node.children.forEach(visit);
  })(root);
  return labels;
}

test("direct Newick accepts a leading rooted directive without changing the tree", () => {
  const root = context.parseNewick("\uFEFF  [&R] ((A:0.1,B:0.2)95:0.3,C:0.4);");
  assert.equal(root.rootingDirective, "rooted");
  assert.deepEqual(tipLabels(root), ["A", "B", "C"]);
  assert.equal(root.children[0].label, "95");
  assert.equal(root.children[0].length, 0.3);
  assert.equal(root.children[0].children[1].length, 0.2);
});

test("direct Newick accepts unrooted and explicit rooted-state directives", () => {
  assert.equal(context.parseNewick("[&U](A,B);").rootingDirective, "unrooted");
  assert.equal(context.parseNewick("[&rooted = true] (A,B);").rootingDirective, "rooted");
  assert.equal(context.parseNewick("[&rooted=false] (A,B);").rootingDirective, "unrooted");
});

test("NEXUS and direct Newick use the same rooting-directive handling", () => {
  const nexus = "#NEXUS\nBegin trees;\nTree t1 = [&R] (1:0.5,2:0.6);\nTranslate 1 'Taxon A', 2 'Taxon B';\nEnd;";
  const root = context.parseNewick(nexus);
  assert.equal(root.rootingDirective, "rooted");
  assert.deepEqual(tipLabels(root), ["Taxon A", "Taxon B"]);
  assert.equal(root.children[0].length, 0.5);
  assert.equal(root.children[1].length, 0.6);
});
