// Test-fixture conversion only; never use to select an uploaded posterior.
// The archived file has two independent single-line TREE statements. Its first
// consensus is the 173-tip reference used by pre-existing layout regressions.
export function selectHistoricalConsensus(text) {
  const statements = [...text.matchAll(/^\s*tree\s+\S+\s*=[^\n]+/gim)];
  if (statements.length !== 2) throw new Error("Historical fixture format changed: re-review selection");
  const second = statements[1];
  return text.slice(0, second.index) + text.slice(second.index + second[0].length);
}
