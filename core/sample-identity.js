/* Stage 82: explicit module boundary; browser and Node share this implementation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderSampleIdentity=api;})(globalThis,function(){
"use strict";
function normalizeTipKey(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

const tipIdentityPolicies = Object.freeze({
  exact: label => String(label ?? "").trim(),
  conflict: label => String(label ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/[_\s]+/g, " ").trim().toLowerCase(),
  auxiliary: normalizeTipKey,
});
function tipIdentityKey(label, policy="auxiliary") {
  if (!tipIdentityPolicies[policy]) throw new Error(`Unknown tip-matching policy: ${policy}`);
  return tipIdentityPolicies[policy](label);
}
function tipProfile(root, policy="exact") {
  const entries=descendantTipNodes(root).map((node,index)=>({node,label:String(node.label??"").trim(),key:tipIdentityKey(node.label,policy),index}));
  const byKey=new Map();
  entries.forEach(entry=>byKey.set(entry.key,[...(byKey.get(entry.key)||[]),entry]));
  const duplicates=[...byKey].filter(([,items])=>items.length>1).map(([key,items])=>({key,labels:items.map(item=>item.label)}));
  return {entries,names:entries.map(item=>item.label),set:new Set(entries.map(item=>item.key)),byKey,duplicates};
}

function tipRolePrefixInfo(key) {
  const match = String(key || "").match(/^(outgroup|out)_+/i);
  return {
    hasPrefix: Boolean(match),
    core: match ? key.slice(match[0].length) : key,
  };
}

function buildTipKeyAlignment(sourceRoot, targetRoot) {
  const sourceTips = descendantTipLabels(sourceRoot).map(label => ({ label, key: normalizeTipKey(label) }));
  const targetTips = descendantTipLabels(targetRoot).map(label => ({ label, key: normalizeTipKey(label) }));
  const sourceKeys = new Set(sourceTips.map(tip => tip.key));
  const targetKeys = new Set(targetTips.map(tip => tip.key));
  if (sourceKeys.size !== sourceTips.length || targetKeys.size !== targetTips.length) {
    throw Object.assign(new Error("Ambiguous tip alignment: multiple tips collide after label normalization"), {code: "TIP_MAPPING_AMBIGUOUS"});
  }
  const targetByCore = new Map();
  targetTips.forEach(tip => {
    const info = tipRolePrefixInfo(tip.key);
    const entries = targetByCore.get(info.core) || [];
    entries.push({ ...tip, ...info });
    targetByCore.set(info.core, entries);
  });
  const keyMap = new Map();
  const alignedPairs = [];
  sourceTips.forEach(sourceTip => {
    if (targetKeys.has(sourceTip.key)) {
      keyMap.set(sourceTip.key, sourceTip.key);
      return;
    }
    const sourceInfo = tipRolePrefixInfo(sourceTip.key);
    const candidates = (targetByCore.get(sourceInfo.core) || [])
      .filter(candidate => candidate.hasPrefix !== sourceInfo.hasPrefix);
    if (candidates.length !== 1) return;
    const targetTip = candidates[0];
    keyMap.set(sourceTip.key, targetTip.key);
    alignedPairs.push({
      sourceLabel: sourceTip.label,
      targetLabel: targetTip.label,
      sourceKey: sourceTip.key,
      targetKey: targetTip.key,
      rule: "outgroup-prefix",
    });
  });
  if (new Set(keyMap.values()).size !== keyMap.size) {
    throw Object.assign(new Error("Tip alias mapping is not one-to-one: multiple source tips map to the same focal-tree tip."),
      { code: "TIP_MAPPING_AMBIGUOUS" });
  }
  return {
    keyMap,
    alignedPairs,
    alignedCount: alignedPairs.length,
    sourceTipCount: sourceTips.length,
    targetTipCount: targetTips.length,
  };
}

function resolvedTipKey(label, tipKeyMap = null) {
  const key = normalizeTipKey(label);
  return tipKeyMap?.get(key) || key;
}

function canonicalSplitKey(descendantTips, allTips) {
  const side = [...new Set(descendantTips)].sort();
  const sideSet = new Set(side);
  const complement = allTips.filter(tip => !sideSet.has(tip));
  if (side.length < 2 || complement.length < 2) return null;
  if (side.length < complement.length) return side.join("\u001f");
  if (complement.length < side.length) return complement.join("\u001f");
  const sideKey = side.join("\u001f"), complementKey = complement.join("\u001f");
  return sideKey < complementKey ? sideKey : complementKey;
}

function allNormalizedTips(root, tipKeyMap = null, policy = "auxiliary") {
  const tips = descendantTipLabels(root).map(label => resolvedTipKey(label, tipKeyMap, policy));
  if (new Set(tips).size !== tips.length) throw Object.assign(new Error("Ambiguous node matching: multiple tips collide after label normalization"), {code: "TIP_MAPPING_AMBIGUOUS"});
  return tips.sort();
}

function findNodeById(node, id) {
  if (!node || node.id === id) return node || null;
  for (const child of node.children) {
    const match = findNodeById(child, id);
    if (match) return match;
  }
  return null;
}

function descendantTipLabels(node) {
  if (!node.children.length) return [node.label.replaceAll("_", " ")];
  return node.children.flatMap(descendantTipLabels);
}

function descendantTipNodes(node) {
  if (!node.children.length) return [node];
  return node.children.flatMap(descendantTipNodes);
}

function baseTipDisplayLabel(label) {
  // Only space the prefix before the first number-bearing identifier token.
  return String(label || "").replace(/^\D*?(?=[^_\s]*\d|$)/u, prefix => prefix.replaceAll("_", " "))
    .replace(/\s+/g, " ").trim();
}

function resolveTipOriginalName(candidate, originals) {
  const requested = String(candidate ?? "").trim();
  if (!requested) return null;
  if (originals.includes(requested)) return requested;
  const exactDisplay = originals.filter(raw => baseTipDisplayLabel(raw) === requested);
  if (exactDisplay.length === 1) return exactDisplay[0];
  const normalized = normalizeTipKey(requested);
  const normalizedMatches = originals.filter(raw => normalizeTipKey(raw) === normalized);
  return normalizedMatches.length === 1 ? normalizedMatches[0] : null;
}

function validateTipLabelOverrides(overrides, originals) {
  const entries = overrides instanceof Map ? [...overrides.entries()] : Object.entries(overrides || {});
  const canonical = new Map();
  const unknown = [];
  const conflicts = [];
  entries.forEach(([candidate, value]) => {
    const raw = resolveTipOriginalName(candidate, originals);
    if (!raw) {
      unknown.push(String(candidate));
      return;
    }
    const display = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!display) throw new Error(`Display label for tip "${candidate}" cannot be empty`);
    if (display.length > 1000) throw new Error(`Display label for tip "${candidate}" exceeds 1,000 characters`);
    if (canonical.has(raw) && canonical.get(raw) !== display) conflicts.push(String(candidate));
    canonical.set(raw, display);
  });
  if (unknown.length) {
    const preview = unknown.slice(0, 6).join(", ");
    throw new Error(`${unknown.length} original tip name(s) in the mapping table are absent from the current tree: ${preview}${unknown.length > 6 ? ", ..." : ""}`);
  }
  if (conflicts.length) throw new Error(`Conflicting display labels mapped for the same tip(s): ${[...new Set(conflicts)].join(", ")}`);
  return canonical;
}
return Object.freeze({normalizeTipKey,tipIdentityPolicies,tipIdentityKey,tipProfile,tipRolePrefixInfo,buildTipKeyAlignment,resolvedTipKey,canonicalSplitKey,allNormalizedTips,findNodeById,descendantTipLabels,descendantTipNodes,baseTipDisplayLabel,resolveTipOriginalName,validateTipLabelOverrides});
});
