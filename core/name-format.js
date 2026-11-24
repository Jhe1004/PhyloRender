/* Stage 82: explicit module boundary; browser and Node share this implementation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderNameFormat=api;})(globalThis,function(){
"use strict";
const SUPRAGENERIC_SUFFIXES = [
  "phyta", "phytina", "opsida", "idae", "anae", "ales", "ineae",
  "aceae", "oideae", "eae", "inae",
];
const SUPRAGENERIC_EXACT_NAMES = new Set([
  "angiospermae", "gymnospermae", "angiosperms", "gymnosperms",
  "eudicots", "monocots", "magnoliids", "rosids", "asterids",
  "mesangiosperms", "tracheophytes", "embryophytes",
]);
const INFRASPECIFIC_RANKS = new Set([
  "subsp", "subvar", "var", "subf", "f",
  "subspecies", "ssp", "variety", "varietas", "forma", "form", "fo",
  "nothosubsp", "nothosubvar", "nothovar", "nothosubf", "nothof",
]);
const INFRAGENERIC_RANKS = new Set([
  "subg", "sect", "subsect", "ser", "subser", "nothosubg",
  "subgenus", "section", "subsection", "series", "subseries",
]);
const TAXON_RANK_MARKERS = new Set([
  ...INFRASPECIFIC_RANKS,
  ...INFRAGENERIC_RANKS,
  "sp", "spp", "cl", "subcl", "ord", "subord", "fam", "subfam", "tr", "subtr", "gen", "nothog",
]);
const IDENTIFICATION_QUALIFIERS = new Set(["cf", "aff"]);

function bareWord(value) {
  return value.normalize("NFKC").replace(/\.$/, "").toLowerCase();
}

function isSupragenericName(value) {
  const word = bareWord(value);
  return SUPRAGENERIC_EXACT_NAMES.has(word) || SUPRAGENERIC_SUFFIXES.some(suffix => word.endsWith(suffix));
}

function markItalic(mask, start, end) {
  for (let index = Math.max(0, start); index < Math.min(mask.length, end); index++) mask[index] = true;
}

function scientificWordTokens(text) {
  return [...text.matchAll(/[A-Za-z\u00c0-\u024f]+(?:-[A-Za-z\u00c0-\u024f]+)*\.?|×/gu)].map(match => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
    bare: bareWord(match[0]),
  }));
}

function markGnfinderMatches(mask, text, matches) {
  (matches || []).forEach(match => {
    const start = Number(match.start);
    const end = Number(match.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) return;
    const chunk = text.slice(start, end);
    const tokens = scientificWordTokens(chunk);
    if (Number(match.cardinality) <= 1) {
      if (start === 0 && !isSupragenericName(chunk)) markItalic(mask, start, end);
      return;
    }
    tokens.forEach(token => {
      if (token.text === "×" || TAXON_RANK_MARKERS.has(token.bare)) return;
      markItalic(mask, start + token.start, start + token.end);
    });
  });
}

function markGnparserWords(mask, text, parse) {
  if (!parse?.parsed) return;
  const quality = Number(parse.quality);
  if (!Number.isFinite(quality) || quality < 1 || quality > 2) return;
  const italicWordTypes = new Set(["GENUS", "SPECIES", "INFRASPECIES"]);
  (parse.words || []).forEach(word => {
    if (!italicWordTypes.has(word.wordType)) return;
    const start = Number(word.start);
    const end = Number(word.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) return;
    const token = text.slice(start, end);
    if (TAXON_RANK_MARKERS.has(bareWord(token)) || isSupragenericName(token)) return;
    markItalic(mask, start, end);
  });
}

function markRuleBasedScientificNames(mask, text) {
  const tokens = scientificWordTokens(text);
  const isCapitalized = token => /^[A-Z\u00c0-\u00de]/u.test(token.text);
  const isLowercase = token => /^[a-z\u00df-\u024f]/u.test(token.text);

  for (let index = 0; index < tokens.length; index++) {
    const genus = tokens[index];
    if (!isCapitalized(genus)) continue;
    // A rank-like suffix is not enough to reject a genus in a binomial:
    // Oreithales integrifolia must remain italic, while standalone Ranunculales stays roman.
    const subdivisionRank = tokens[index + 1];
    const subdivisionEpithet = tokens[index + 2];
    if (INFRAGENERIC_RANKS.has(subdivisionRank?.bare) && subdivisionEpithet && isCapitalized(subdivisionEpithet)) {
      markItalic(mask, genus.start, genus.end);
      markItalic(mask, subdivisionEpithet.start, subdivisionEpithet.end);
      index += 2;
      continue;
    }
    let cursor = index + 1;
    if (IDENTIFICATION_QUALIFIERS.has(tokens[cursor]?.bare)) cursor++;
    if (tokens[cursor]?.text === "×") cursor++;
    const species = tokens[cursor];
    if (species && isLowercase(species) && !INFRASPECIFIC_RANKS.has(species.bare) && species.bare !== "sp" && species.bare !== "spp") {
      markItalic(mask, genus.start, genus.end);
      markItalic(mask, species.start, species.end);
      let next = cursor + 1;
      while (next < tokens.length) {
        const rank = tokens[next];
        if (!INFRASPECIFIC_RANKS.has(rank.bare)) break;
        if (rank.bare === "f" && tokens[next + 1]?.bare === "sp") {
          const specialForm = tokens[next + 2];
          if (!specialForm || !isLowercase(specialForm)) break;
          markItalic(mask, specialForm.start, specialForm.end);
          next += 3;
          continue;
        }
        const epithet = tokens[next + 1];
        if (!epithet || !isLowercase(epithet)) break;
        markItalic(mask, epithet.start, epithet.end);
        next += 2;
      }
      index = cursor;
      continue;
    }
    if (species && (species.bare === "sp" || species.bare === "spp")) {
      markItalic(mask, genus.start, genus.end);
    }
  }

}

function scientificNameSegmentsFromAnalysis(text, matches = [], parse = null) {
  if (!text) return [];
  if (/^↪\s+Continued\s+clade\b/.test(text)) return [{ text, italic: false }];
  const mask = Array(text.length).fill(false);
  markGnparserWords(mask, text, parse);
  markGnfinderMatches(mask, text, matches);
  markRuleBasedScientificNames(mask, text);
  const segments = [];
  let start = 0;
  while (start < text.length) {
    const italic = mask[start];
    let end = start + 1;
    while (end < text.length && mask[end] === italic) end++;
    segments.push({ text: text.slice(start, end), italic });
    start = end;
  }
  return segments;
}
return Object.freeze({scientificNameSegmentsFromAnalysis});
});
