"use strict";

const assert = require("node:assert/strict");
const ranks = require("../taxon-rank-normalizer.js");

const cases = [
  ["Coptis japonica VAR dissecta", "Coptis japonica var. dissecta"],
  ["Coptis japonica variety dissecta", "Coptis japonica var. dissecta"],
  ["Delphinium elatum var.sericeum", "Delphinium elatum var. sericeum"],
  ["Delphinium pylzowii var.trigynum", "Delphinium pylzowii var. trigynum"],
  ["Adonis ramosa SSP fupingensis", "Adonis ramosa subsp. fupingensis"],
  ["Adonis ramosa subspecies fupingensis", "Adonis ramosa subsp. fupingensis"],
  ["Aconitum jaluense subsp.jaluense", "Aconitum jaluense subsp. jaluense"],
  ["Aconitum japonicum subsp.napiforme", "Aconitum japonicum subsp. napiforme"],
  ["Saxifraga aizoon subvar brevifolia fo multicaulis subforma surculosa", "Saxifraga aizoon subvar. brevifolia f. multicaulis subf. surculosa"],
  ["Mentha piperita nothosubspecies pyramidalis", "Mentha piperita nothosubsp. pyramidalis"],
  ["Fusarium oxysporum forma specialis cubense", "Fusarium oxysporum f. sp. cubense"],
  ["Euphorbia subgenus Chamaesyce", "Euphorbia subg. Chamaesyce"],
  ["Euphorbia SECTION Anisophyllum", "Euphorbia sect. Anisophyllum"],
  ["Actaea species HJ-01", "Actaea sp. HJ-01"],
  ["family Ranunculaceae", "fam. Ranunculaceae"],
  ["SUBFAMILY Ranunculoideae", "subfam. Ranunculoideae"],
  ["Clematis florida F. Smith", "Clematis florida F. Smith"],
  ["sample VAR 01", "sample VAR 01"],
  ["Ranunculaceae VAR clade", "Ranunculaceae VAR clade"],
];

cases.forEach(([input, expected]) => assert.equal(ranks.normalize(input), expected, input));
const spacingReport = ranks.normalizeWithReport("Delphinium elatum var.sericeum");
assert.equal(spacingReport.changes.length, 1, "missing rank spacing should be reported as a display normalization");
assert.equal(spacingReport.changes[0].spacingAdjusted, true);
assert.equal(ranks.normalize("Actaea sp."), "Actaea sp.", "an end-of-label rank must not gain trailing whitespace");
assert.equal(ranks.normalize("sample.version.01"), "sample.version.01", "ordinary dotted identifiers must remain unchanged");
assert.ok(ranks.rules.length >= 25, "rank alias table should remain broad and extensible");
console.log(`taxon rank normalizer: ${cases.length} cases passed; ${ranks.rules.length} standard ranks available`);
