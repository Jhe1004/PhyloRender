(function initializeTaxonRankNormalizer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PhyloRenderTaxonRanks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTaxonRankNormalizer() {
  "use strict";

  const LETTERS = "A-Za-z\\u00c0-\\u024f";
  const WORD = `[${LETTERS}]+(?:-[${LETTERS}]+)*`;

  function rankRule(standard, aliases, scope, description) {
    const alternatives = aliases
      .slice()
      .sort((a, b) => b.length - a.length)
      .map(alias => alias
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\ /g, "\\s*"));
    return Object.freeze({
      standard,
      scope,
      description,
      // A rank may arrive as `var.sericeum` or `subsp.jaluense`.  Consume the
      // period even when the following epithet is attached; without a period,
      // still require a real word boundary so words such as `variant` are safe.
      pattern: new RegExp(`\\b(?:${alternatives.join("|")})(?:\\.|(?=$|[^${LETTERS}]))`, "giu"),
    });
  }

  // Long or historically common spellings are accepted as input. Output
  // follows ICN Recommendation 5A, including sub- and notho- derivatives.
  const RULES = Object.freeze([
    rankRule("f. sp.", ["forma specialis", "form specialis", "f. sp", "fsp"], "infraspecific", "special form"),
    rankRule("nothosubsp.", ["nothosubspecies", "notho-subspecies", "nothosubsp", "notho-subsp", "nsubsp"], "infraspecific", "hybrid subspecies"),
    rankRule("nothosubvar.", ["nothosubvariety", "nothosubvarietas", "notho-subvariety", "nothosubvar", "notho-subvar"], "infraspecific", "hybrid subvariety"),
    rankRule("nothovar.", ["nothovariety", "nothovarietas", "notho-variety", "nothovar", "notho-var"], "infraspecific", "hybrid variety"),
    rankRule("nothosubf.", ["nothosubform", "nothosubforma", "notho-subform", "nothosubf", "notho-subf"], "infraspecific", "hybrid subform"),
    rankRule("nothof.", ["nothoform", "nothoforma", "notho-form", "nothof", "notho-f"], "infraspecific", "hybrid form"),
    rankRule("subsp.", ["subspecies", "sub-species", "subsp", "ssp"], "infraspecific", "subspecies"),
    rankRule("subvar.", ["subvariety", "subvarietas", "sub-variety", "subvar"], "infraspecific", "subvariety"),
    rankRule("var.", ["variety", "varietas", "var"], "infraspecific", "variety"),
    rankRule("subf.", ["subform", "subforma", "sub-form", "subf"], "infraspecific", "subform"),
    rankRule("f.", ["forma", "form", "fo", "f"], "infraspecific", "form"),
    rankRule("nothosubg.", ["nothosubgenus", "notho-subgenus", "nothosubg", "notho-subg"], "infrageneric", "hybrid subgenus"),
    rankRule("nothog.", ["nothogenus", "notho-genus", "nothog", "notho-g"], "higher", "hybrid genus"),
    rankRule("subg.", ["subgenus", "sub-genus", "subg", "subgen"], "infrageneric", "subgenus"),
    rankRule("subsect.", ["subsection", "subsectio", "sub-section", "subsect"], "infrageneric", "subsection"),
    rankRule("sect.", ["section", "sectio", "sect"], "infrageneric", "section"),
    rankRule("subser.", ["subseries", "sub-series", "subser"], "infrageneric", "subseries"),
    rankRule("ser.", ["series", "ser"], "infrageneric", "series"),
    rankRule("spp.", ["species plural", "spp"], "species", "multiple unidentified species"),
    rankRule("sp.", ["species", "sp"], "species", "species"),
    rankRule("subcl.", ["subclass", "subclassis", "sub-class", "subcl"], "higher", "subclass"),
    rankRule("cl.", ["class", "classis", "cl"], "higher", "class"),
    rankRule("subord.", ["suborder", "subordo", "sub-order", "subord"], "higher", "suborder"),
    rankRule("ord.", ["order", "ordo", "ord"], "higher", "order"),
    rankRule("subfam.", ["subfamily", "subfamilia", "sub-family", "subfam"], "higher", "subfamily"),
    rankRule("fam.", ["family", "familia", "fam"], "higher", "family"),
    rankRule("subtr.", ["subtribe", "subtribus", "sub-tribe", "subtr"], "higher", "subtribe"),
    rankRule("tr.", ["tribe", "tribus", "tr"], "higher", "tribe"),
    rankRule("gen.", ["genus", "gen"], "higher", "genus"),
  ]);

  const BINOMIAL = new RegExp(`(?:^|[\\s([])[A-Z\\u00c0-\\u00de][${LETTERS}-]*\\s+(?:×\\s*)?[a-z\\u00df-\\u024f][${LETTERS}-]*`, "u");
  const GENUS = new RegExp(`(?:^|[\\s([])[A-Z\\u00c0-\\u00de][${LETTERS}-]*`, "u");
  const NEXT_WORD = new RegExp(`^\\s*(?:×\\s*)?(${WORD})`, "u");

  function nextWord(text, end) {
    return NEXT_WORD.exec(text.slice(end))?.[1] || "";
  }

  function hasBinomialBefore(text, start) {
    const match = BINOMIAL.exec(text);
    return Boolean(match && match.index + match[0].length <= start);
  }

  function hasGenusBefore(text, start) {
    const match = GENUS.exec(text);
    return Boolean(match && match.index + match[0].length <= start);
  }

  function isLowercaseWord(value) {
    return /^[a-z\u00df-\u024f]/u.test(value);
  }

  function isCapitalizedWord(value) {
    return /^[A-Z\u00c0-\u00de]/u.test(value);
  }

  function contextAllows(rule, text, start, end) {
    const following = nextWord(text, end);
    if (rule.scope === "infraspecific") {
      return hasBinomialBefore(text, start) && isLowercaseWord(following);
    }
    if (rule.scope === "infrageneric") {
      return hasGenusBefore(text, start) && isCapitalizedWord(following);
    }
    if (rule.scope === "species") return hasGenusBefore(text, start);
    if (rule.scope === "higher") {
      const prefix = text.slice(0, start).trim();
      return (!prefix || /[|:;,(]$/.test(prefix)) && isCapitalizedWord(following);
    }
    return false;
  }

  function normalizeWithReport(input) {
    const text = String(input ?? "").replace(/\s+/g, " ").trim();
    const candidates = [];
    RULES.forEach((rule, ruleIndex) => {
      rule.pattern.lastIndex = 0;
      for (const match of text.matchAll(rule.pattern)) {
        const start = match.index;
        const end = start + match[0].length;
        if (!contextAllows(rule, text, start, end)) continue;
        candidates.push({ start, end, original: match[0], rule, ruleIndex });
      }
    });

    candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.ruleIndex - b.ruleIndex);
    const accepted = [];
    for (const candidate of candidates) {
      if (accepted.some(item => candidate.start < item.end && candidate.end > item.start)) continue;
      accepted.push(candidate);
    }
    accepted.sort((a, b) => b.start - a.start);

    let normalized = text;
    const changes = [];
    accepted.forEach(candidate => {
      const needsFollowingSpace = candidate.end < text.length && !/\s/u.test(text[candidate.end]);
      const replacement = candidate.rule.standard + (needsFollowingSpace ? " " : "");
      normalized = normalized.slice(0, candidate.start) + replacement + normalized.slice(candidate.end);
      if (candidate.original !== candidate.rule.standard || needsFollowingSpace) {
        changes.push({
          original: candidate.original,
          standard: candidate.rule.standard,
          description: candidate.rule.description,
          spacingAdjusted: needsFollowingSpace,
        });
      }
    });
    changes.reverse();
    return { text: normalized, changes };
  }

  return Object.freeze({
    normalize: input => normalizeWithReport(input).text,
    normalizeWithReport,
    rules: RULES.map(rule => Object.freeze({
      standard: rule.standard,
      scope: rule.scope,
      description: rule.description,
    })),
  });
});
