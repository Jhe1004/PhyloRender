/* Shared input science: browser, Web Worker and Node use the same implementation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderInput=api;})(globalThis,function(){
"use strict";
function extractLeadingRootingDirective(text) {
  let newick = text;
  let rootingDirective = null;
  while (true) {
    const match = newick.match(/^\s*\[\s*&\s*(R|U|rooted\s*=\s*(?:true|false|yes|no|1|0))\s*\]\s*/i);
    if (!match) break;
    const value = match[1].replace(/\s+/g, "").toLowerCase();
    rootingDirective = value === "r" || value === "rooted=true" || value === "rooted=yes" || value === "rooted=1"
      ? "rooted"
      : "unrooted";
    newick = newick.slice(match[0].length);
  }
  return { newick: newick.trim(), rootingDirective };
}

function extractTreeSource(text, { treeIndex } = {}) {
  if (typeof text !== "string" || text.length > 12_000_000)
    throw Object.assign(new Error("Tree text is empty, invalid, or exceeds the 12 MB parsing safety limit"), { code: "TREE_INPUT_LIMIT" });
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!/#nexus/i.test(trimmed.slice(0, 1000))) {
    const source = extractLeadingRootingDirective(trimmed);
    return { ...source, translate: new Map() };
  }
  // One quote/comment-aware statement scan supplies both TREE and TRANSLATE.
  // Keep offsets, and scope mappings to the selected TREES block.
  const invalid = message => Object.assign(new Error(message), { code: "TREE_NEXUS_INVALID" });
  let depth = 0, quoted = null, start = 0;
  const mask = trimmed.split(""), clean = trimmed.split(""), commands = [];
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (quoted) {
      mask[i] = " ";
      if (ch === quoted && trimmed[i + 1] === quoted) { mask[++i] = " "; continue; }
      if (ch === quoted) { mask[i] = ch; quoted = null; }
    } else if (depth) {
      mask[i] = clean[i] = " ";
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
    } else if (ch === "[") { depth++; mask[i] = clean[i] = " "; }
    else if (ch === "'" || ch === '"') quoted = ch;
    else if (ch === "]") throw invalid("Unexpected closing bracket ']' in NEXUS file");
    else if (ch === ";") { commands.push({ start, end: i }); start = i + 1; }
  }
  if (depth || quoted) throw invalid("Unclosed comment or quoted string in NEXUS file");
  const masked = mask.join("").replace(/^#nexus\b/i, "      "), cleaned = clean.join("");
  if (masked.slice(start).trim()) throw invalid("NEXUS statement is missing its terminating semicolon");
  const statements = [], blocks = [];
  let block = null;
  for (const command of commands) {
    const text = masked.slice(command.start, command.end);
    const begin = text.match(/^\s*begin\s+(\w+)\s*$/i);
    if (begin) {
      if (block) throw invalid("Nested NEXUS blocks are not permitted");
      block = { name: begin[1].toLowerCase(), translates: [] }; blocks.push(block); continue;
    }
    if (/^\s*(?:end|endblock)\s*$/i.test(text)) {
      if (!block) throw invalid("NEXUS END statement has no matching BEGIN");
      block = null; continue;
    }
    if (block?.name !== "trees") continue;
    if (/^\s*translate\b/i.test(text)) block.translates.push(command);
    const tree = text.match(/^\s*(?:tree|utree)\s+(?:\*\s*)?(?:'[^']*'|"[^"]*"|[^\s=]+)\s*=/i);
    if (tree) statements.push({ start: command.start + tree[0].length, end: command.end, block });
  }
  if (block) throw invalid("NEXUS block is missing its terminating END statement");
  if (statements.length > 1 && treeIndex === undefined)
    throw Object.assign(new Error("NEXUS file contains multiple trees; please select or summarize a single consensus/MCC tree rather than defaulting to the first posterior sample"), { code: "TREE_MULTIPLE_TREES", tree_count: statements.length });
  if (treeIndex !== undefined && (!Number.isInteger(treeIndex) || treeIndex < 0 || treeIndex >= statements.length))
    throw Object.assign(new Error("Requested NEXUS tree index is out of range"), { code: "TREE_SELECTION_INVALID" });
  const treeStatement = statements[treeIndex ?? 0];
  if (!treeStatement) throw new Error("No TREE statement found in NEXUS file");
  const source = extractLeadingRootingDirective(`${trimmed.slice(treeStatement.start, treeStatement.end).trim()};`);
  const translate = new Map();
  const tables = treeStatement.block.translates;
  if (tables.length > 1) throw Object.assign(new Error("Multiple TRANSLATE tables appear in the same TREES block; cannot guess which mapping applies"), { code: "TREE_TRANSLATE_DUPLICATE" });
  const translateBlock = tables[0];
  if (translateBlock) {
    const translatedNames = new Set();
    const entries = tokenizeNewick(cleaned.slice(translateBlock.start, translateBlock.end).replace(/^\s*translate\b/i, ""));
    let pos = 0;
    while (pos < entries.length) {
      const key = entries[pos++], value = entries[pos++];
      if (key?.type !== "word" || value?.type !== "word" || !key.value || !value.value ||
          (pos < entries.length && entries[pos]?.type !== ","))
        throw Object.assign(new Error("NEXUS TRANSLATE table contains an unparseable entry"), { code: "TREE_TRANSLATE_INVALID" });
      if (translate.has(key.value) || translatedNames.has(value.value))
        throw Object.assign(new Error("NEXUS TRANSLATE table contains duplicate taxon tokens or duplicate tip names"), { code: "TREE_TRANSLATE_DUPLICATE" });
      translate.set(key.value, value.value); translatedNames.add(value.value);
      if (pos < entries.length && ++pos === entries.length)
        throw Object.assign(new Error("NEXUS TRANSLATE table ends with a trailing comma"), { code: "TREE_TRANSLATE_INVALID" });
    }
    if (!translate.size)
      throw Object.assign(new Error("NEXUS TRANSLATE table is incomplete"), { code: "TREE_TRANSLATE_INVALID" });
  }
  return { ...source, translate };
}

function tokenizeNewick(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    if (tokens.length >= 1_000_000)
      throw Object.assign(new Error("Tree token count exceeds the safety limit"), { code: "TREE_INPUT_LIMIT", offset: i });
    const ch = text[i];
    if (ch === "]")
      throw Object.assign(new Error(`Unexpected closing bracket ']' in Newick string at character ${i + 1}`), { code: "TREE_UNEXPECTED_TOKEN", offset: i });
    if (/\s/.test(ch)) { i++; continue; }
    if ("(),:;".includes(ch)) { tokens.push({ type: ch, value: ch }); i++; continue; }
    if (ch === "[") {
      let depth = 1, value = "", j = i + 1;
      while (j < text.length && depth) {
        if (text[j] === "[") depth++;
        else if (text[j] === "]") depth--;
        if (depth) value += text[j];
        j++;
      }
      if (depth) throw new Error("Unclosed bracketed comment in Newick string");
      tokens.push({ type: "comment", value }); i = j; continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let value = "", j = i + 1;
      while (j < text.length) {
        if (text[j] === quote && text[j + 1] === quote) { value += quote; j += 2; continue; }
        if (text[j] === quote) break;
        value += text[j++];
      }
      if (j >= text.length) throw new Error("Unclosed quoted taxon or node label");
      tokens.push({ type: "word", value }); i = j + 1; continue;
    }
    let value = "", j = i;
    while (j < text.length && !/[\s(),:;\[\]]/.test(text[j])) value += text[j++];
    tokens.push({ type: "word", value }); i = j;
  }
  return tokens;
}

function parseNewick(rawText, { validateInput = true, treeIndex } = {}) {
  const source = extractTreeSource(rawText, { treeIndex });
  const tokens = tokenizeNewick(source.newick);
  let pos = 0, nodeId = 0;
  const peek = type => tokens[pos]?.type === type;
  const take = type => {
    if (!peek(type)) throw new Error(`Expected "${type}", got "${tokens[pos]?.value ?? "end of input"}"`);
    return tokens[pos++];
  };

  function parseSuffix(node, internal) {
    if (internal && peek("word")) node.label = take("word").value;
    while (peek("comment")) {
      const comment = take("comment").value;
      node.comments.push(comment);
      node.comment += `${node.comment ? ";" : ""}${comment}`;
    }
    if (peek(":")) {
      take(":");
      const lengthToken = take("word").value;
      const length = Number(lengthToken);
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(lengthToken) || !Number.isFinite(length))
        throw Object.assign(new Error(`Invalid branch length: ${lengthToken}`), { code: "TREE_INVALID_BRANCH_LENGTH" });
      if (length < 0) throw Object.assign(new Error(`Negative branch length encountered (${lengthToken}); negative lengths are never silently clamped to zero`), { code: "TREE_NEGATIVE_BRANCH_LENGTH" });
      node.length = length;
      while (peek("comment")) {
        const comment = take("comment").value;
        node.comments.push(comment);
        node.comment += `${node.comment ? ";" : ""}${comment}`;
      }
    }
    if (peek("word")) throw Object.assign(new Error(`Ambiguous unquoted label "${node.label} ${tokens[pos].value}"; labels containing spaces must be enclosed in single quotes (e.g., 'Homo sapiens'). Import aborted without truncating labels.`), { code: "TREE_AMBIGUOUS_LABEL", sample: node.label });
    return node;
  }

  function subtree(depth = 0) {
    if (depth > 512 || nodeId >= 200_000)
      throw Object.assign(new Error("Tree depth or node count exceeds the parsing safety limit"), { code: "TREE_INPUT_LIMIT" });
    const node = { id: `n${nodeId++}`, label: "", length: null, comment: "", comments: [], children: [] };
    if (peek("(")) {
      take("(");
      node.children.push(subtree(depth + 1));
      while (peek(",")) { take(","); node.children.push(subtree(depth + 1)); }
      take(")");
    } else {
      node.label = take("word").value;
    }
    return parseSuffix(node, node.children.length > 0);
  }

  const root = subtree();
  if (peek(";")) take(";");
  if (pos !== tokens.length) throw new Error(`Unexpected trailing tokens after tree semicolon: ${tokens[pos].value}`);
  if (source.rootingDirective) root.rootingDirective = source.rootingDirective;
  if (source.translate.size) {
    let translatedTips = 0;
    (function translateTips(node) {
      if (!node.children.length && !source.translate.has(node.label))
        throw Object.assign(new Error(`NEXUS TRANSLATE table is missing tip token ${node.label}`), { code: "TREE_TRANSLATE_MISSING", sample: node.label });
      if (!node.children.length && source.translate.has(node.label)) {
        node.label = source.translate.get(node.label);
        translatedTips++;
      }
      node.children.forEach(translateTips);
    })(root);
    if (!translatedTips) throw new Error("NEXUS TRANSLATE table is present, but no tip tokens in the tree matched it");
  }
  // Validate the source before any workspace mutation or rerooting. A normal
  // bifurcating root is valid; only actual one-child input nodes are blocked.
  const unaryNodes = [];
  const inputTipNames = new Set();
  function validateStructure(node, path = "root") {
    if (!node.children.length) {
      if (!node.label.trim() || inputTipNames.has(node.label))
        throw Object.assign(new Error(`Empty or duplicate tip label: ${node.label || path}`), { code: "TREE_DUPLICATE_OR_EMPTY_TIP" });
      inputTipNames.add(node.label);
    }
    if (node.children.length === 1) {
      let descendant = node.children[0];
      while (descendant.children.length) descendant = descendant.children[0];
      unaryNodes.push({ nodeId: node.id, path, exampleTip: descendant.label, label: node.label });
    }
    node.children.forEach((child, index) => validateStructure(child, `${path}/child${index + 1}`));
  }
  if (validateInput) validateStructure(root);
  if (unaryNodes.length) {
    const examples = unaryNodes.slice(0, 3).map(issue => `${issue.path} (example tip: ${issue.exampleTip})`).join("; ");
    const error = new Error(`Tree topology check failed [TREE_SINGLE_CHILD_NODE]: input contains ${unaryNodes.length} degree-2 unary node(s) without an actual bifurcation (${examples}). Import aborted without modifying the input file. Sampled-ancestor or single-child annotation nodes are not supported; collapse or resolve unary nodes before re-importing.`);
    error.code = "TREE_SINGLE_CHILD_NODE";
    error.issues = unaryNodes;
    throw error;
  }
  return root;
}

const NUMERIC_TOKEN_SOURCE = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const NUMERIC_TOKEN_RE = new RegExp(`^${NUMERIC_TOKEN_SOURCE}$`);
const NUMERIC_SEQUENCE_RE = new RegExp(`^${NUMERIC_TOKEN_SOURCE}(?:\\/${NUMERIC_TOKEN_SOURCE})*$`);
const SUPPORT_FIELD_PRIORITY = [
  "label", "support", "bootstrap", "bootstrap_support", "boot", "bs", "b",
  "posterior", "posterior_probability", "probability", "prob", "pp1", "pp",
  "local_posterior", "localposterior", "local_posterior_probability", "lpp",
  "ufboot", "ufboot2", "sh_alrt", "sh_like", "alrt",
  "abayes", "lbp", "tbe", "fbp", "rootstrap", "quartet_support", "q1", "comment",
];
const ANNOTATION_FIELD_LABELS = {
  label: "Internal node label",
  comment: "Bracketed numeric comment",
  support: "Support",
  bootstrap: "Bootstrap",
  bootstrap_support: "Bootstrap support",
  boot: "Bootstrap",
  bs: "Bootstrap (BS)",
  b: "NHX Bootstrap (B)",
  posterior: "Posterior",
  posterior_probability: "Posterior probability",
  probability: "Probability",
  prob: "Probability",
  pp: "Posterior probability (PP)",
  pp1: "ASTRAL local posterior (pp1)",
  local_posterior: "Local posterior",
  localposterior: "Local posterior",
  local_posterior_probability: "Local posterior probability",
  lpp: "Local posterior probability (LPP)",
  q1: "ASTRAL quartet support (q1)",
  q2: "ASTRAL quartet support (q2)",
  q3: "ASTRAL quartet support (q3)",
  f1: "ASTRAL quartet count (f1)",
  f2: "ASTRAL quartet count (f2)",
  f3: "ASTRAL quartet count (f3)",
  qc: "ASTRAL quartet count (QC)",
  en: "ASTRAL effective genes (EN)",
  sh_alrt: "SH-aLRT",
  sh_like: "SH-like support",
  alrt: "aLRT",
  ufboot: "UFBoot",
  ufboot2: "UFBoot2",
  abayes: "aBayes",
  lbp: "Local bootstrap",
  tbe: "TBE",
  fbp: "FBP",
  rootstrap: "Rootstrap",
  height: "Node height",
  height_mean: "Mean node height",
  height_median: "Median node height",
  height_95pct_hpd: "Node height 95% HPD",
  "95pcthpd": "Node age 95% HPD",
  "95pct_hpd": "Node age 95% HPD",
  rate: "Branch rate",
  rate_mean: "Mean branch rate",
  length: "Annotated branch length",
};

function normalizeAnnotationKey(key) {
  return String(key || "").trim().toLowerCase().replace(/%/g, "pct").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function annotationFieldLabel(key) {
  return ANNOTATION_FIELD_LABELS[key] || key.replaceAll("_", " ");
}

function parseNumericAnnotationValue(rawValue) {
  let text = String(rawValue ?? "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) text = text.slice(1, -1).trim();
  if (NUMERIC_SEQUENCE_RE.test(text)) return { value: text, scalar: !text.includes("/") };
  const pairs = { "{": "}", "[": "]", "(": ")" };
  if (pairs[text[0]] === text.at(-1)) text = text.slice(1, -1).trim();
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length > 1 && parts.every(part => NUMERIC_TOKEN_RE.test(part))) {
    return { value: parts.join("–"), scalar: false };
  }
  return null;
}

function parseAnnotationEntries(comment) {
  const entries = [];
  let text = String(comment || "").trim();
  text = text.replace(/^&&NHX:/i, "").replace(/^&+/, "");
  let index = 0;
  while (index < text.length) {
    while (index < text.length && /[\s,;:&]/.test(text[index])) index++;
    if (!/[A-Za-z0-9_]/.test(text[index] || "")) { index++; continue; }
    const keyStart = index++;
    while (index < text.length && /[A-Za-z0-9_.%+\-]/.test(text[index])) index++;
    const keyEnd = index;
    while (index < text.length && /\s/.test(text[index])) index++;
    // Consume each candidate once. Retrying a suffix regex at every character
    // makes a long plain-text comment quadratic when it contains no '='.
    if (text[index] !== "=") continue;
    const originalKey = text.slice(keyStart, keyEnd);
    index++;
    const valueStart = index;
    while (index < text.length && /\s/.test(text[index])) index++;
    let rawValue = text.slice(valueStart, index);
    const opener = text[index], closers = { "{": "}", "[": "]", "(": ")" };
    if (closers[opener]) {
      const closer = closers[opener];
      let depth = 0;
      do {
        const ch = text[index++];
        rawValue += ch;
        if (ch === opener) depth++;
        else if (ch === closer) depth--;
      } while (index < text.length && depth > 0);
    } else if (opener === '"' || opener === "'") {
      const quote = opener;
      rawValue += text[index++];
      while (index < text.length) {
        const ch = text[index++];
        rawValue += ch;
        if (ch === quote) break;
      }
    } else {
      while (index < text.length && !/[,;:&]/.test(text[index])) rawValue += text[index++];
    }
    entries.push({ key: normalizeAnnotationKey(originalKey), rawValue });
  }
  return entries;
}

function parseAnnotationComment(comment) {
  const fields = new Map();
  const bare = String(comment || "").trim().match(new RegExp(`^(?:&)?(?:I)?(${NUMERIC_TOKEN_SOURCE})$`, "i"));
  if (bare) {
    fields.set("comment", { key: "comment", label: annotationFieldLabel("comment"), value: bare[1], scalar: true });
    return fields;
  }
  for (const { key, rawValue } of parseAnnotationEntries(comment)) {
    const parsed = parseNumericAnnotationValue(rawValue);
    if (parsed) {
      fields.set(key, { key, label: annotationFieldLabel(key), value: parsed.value, scalar: parsed.scalar });
    }
  }
  return fields;
}

function numericFieldsFromNode(node) {
  const fields = new Map();
  const label = String(node.label || "").trim();
  let parsedLabel = parseNumericAnnotationValue(label);
  if (!parsedLabel && label.includes("/")) {
    const parts = label.split("/");
    let firstNumeric = parts.length;
    while (firstNumeric > 0 && NUMERIC_TOKEN_RE.test(parts[firstNumeric - 1])) firstNumeric--;
    if (firstNumeric > 0 && firstNumeric < parts.length) parsedLabel = parseNumericAnnotationValue(parts.slice(firstNumeric).join("/"));
  }
  if (parsedLabel) fields.set("label", { key: "label", label: annotationFieldLabel("label"), value: parsedLabel.value, scalar: parsedLabel.scalar });
  const comments = node.comments?.length ? node.comments : (node.comment ? [node.comment] : []);
  comments.forEach(comment => parseAnnotationComment(comment).forEach((field, key) => fields.set(key, field)));
  return fields;
}

const TIME_HPD_KEYS = new Set(["height_95pct_hpd", "height_95_hpd", "height_hpd", "95pcthpd", "95pct_hpd"]);

function validateTimeAnnotations(node) {
  const source = node.original || node, values = new Map();
  let hpd = null;
  const comments = source.comments?.length ? source.comments : (source.comment ? [source.comment] : []);
  for (const comment of comments) for (const {key, rawValue} of parseAnnotationEntries(comment)) {
    if (TIME_HPD_KEYS.has(key)) {
      const parsed = parseNumericAnnotationValue(rawValue);
      const range = parsed ? parsed.value.split("–").map(Number) : null;
      if (!range || range.length !== 2 || !range.every(Number.isFinite) || range[0] < 0 || range[1] < range[0])
        throw Object.assign(new Error("HPD credible interval must contain exactly two finite, non-negative, non-decreasing bounds; malformed intervals are never auto-repaired"), {code:"TIME_INVALID_HPD", field:key});
      if (hpd && (hpd[0] !== range[0] || hpd[1] !== range[1]))
        throw Object.assign(new Error("Conflicting HPD interval annotations on the same node; specify a single unambiguous interval"), {code:"TIME_HPD_CONFLICT", field:key});
      hpd = range;
      continue;
    }
    if (!["height", "height_mean", "height_median"].includes(key)) continue;
    const parsed = parseNumericAnnotationValue(rawValue);
    const value = parsed?.scalar ? Number(parsed.value) : NaN;
    if (!Number.isFinite(value) || value < 0)
      throw Object.assign(new Error(`Time-calibrated tree contains an invalid ${key} age; malformed annotations cannot be treated as missing`), {code:"TIME_INVALID_AGE", field:key});
    if (values.has(key) && values.get(key) !== value)
      throw Object.assign(new Error(`Conflicting ${key} age annotations on the same node; specify a single unambiguous value`), {code:"TIME_AGE_CONFLICT", field:key});
    values.set(key, value);
  }
  return {ages:values, hpd};
}

function supportFieldFromNode(node) {
  const fields = numericFieldsFromNode(node);
  for (const key of SUPPORT_FIELD_PRIORITY) {
    const field = fields.get(key);
    if (field && (field.scalar || key === "label")) return field;
  }
  return null;
}

function supportFromNode(node) {
  return supportFieldFromNode(node)?.value ?? null;
}

function supportFromDisplayEdge(node) {
  // A rerooted node carries the support of its new incoming edge. A null
  // edge value is authoritative even when the original node had a label.
  return Object.hasOwn(node, "incomingEdgeId") ? node.support ?? null : supportFromNode(node);
}

function discoverNodeNumericFields(root) {
  const catalog = new Map();
  function visit(node, isRoot = false) {
    if (node.children.length && !isRoot) {
      numericFieldsFromNode(node).forEach(field => {
        const current = catalog.get(field.key) || { ...field, count: 0 };
        current.count++;
        current.scalar = current.scalar && field.scalar;
        catalog.set(field.key, current);
      });
    }
    node.children.forEach(child => visit(child));
  }
  visit(root, true);
  return [...catalog.values()].sort((a, b) => {
    const rankA = SUPPORT_FIELD_PRIORITY.indexOf(a.key), rankB = SUPPORT_FIELD_PRIORITY.indexOf(b.key);
    const normalizedA = rankA < 0 ? 999 : rankA, normalizedB = rankB < 0 ? 999 : rankB;
    return normalizedA - normalizedB || b.count - a.count || a.label.localeCompare(b.label);
  });
}

function buildGraph(root) {
  const nodes = new Map(), edges = [];
  function visit(node, parent = null) {
    nodes.set(node.id, { id: node.id, tipLabel: node.children.length ? "" : node.label, original: node });
    if (parent) {
      edges.push({
        id: `e${edges.length}`,
        a: parent.id,
        b: node.id,
        length: node.length,
        support: node.children.length ? supportFromNode(node) : null,
      });
    }
    node.children.forEach(child => visit(child, node));
  }
  visit(root);
  const adjacency = new Map([...nodes.keys()].map(id => [id, []]));
  edges.forEach(edge => {
    adjacency.get(edge.a).push({ node: edge.b, edge });
    adjacency.get(edge.b).push({ node: edge.a, edge });
  });
  return { nodes, edges, adjacency, originalRootId: root.id };
}


return {extractLeadingRootingDirective,extractTreeSource,tokenizeNewick,parseNewick,normalizeAnnotationKey,annotationFieldLabel,parseNumericAnnotationValue,parseAnnotationEntries,parseAnnotationComment,numericFieldsFromNode,validateTimeAnnotations,supportFieldFromNode,supportFromNode,supportFromDisplayEdge,discoverNodeNumericFields,buildGraph,NUMERIC_TOKEN_SOURCE,NUMERIC_TOKEN_RE,NUMERIC_SEQUENCE_RE,SUPPORT_FIELD_PRIORITY,ANNOTATION_FIELD_LABELS};
});
