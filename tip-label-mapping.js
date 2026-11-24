(function exposeTipLabelMappingParser(global) {
  "use strict";

  const SOURCE_HEADERS = new Set([
    "original", "originalname", "source", "sourcename", "sample", "samplename",
    "oldname", "currentname", "id",
    "\u539f\u59cb\u540d\u79f0", "\u539f\u540d\u79f0", "\u65e7\u540d\u79f0", "\u6837\u54c1\u540d\u79f0", "\u6837\u54c1id",
  ]);
  const DISPLAY_HEADERS = new Set([
    "display", "displayname", "newname", "label", "replacement", "renamed",
    "\u663e\u793a\u540d\u79f0", "\u65b0\u540d\u79f0", "\u4fee\u6539\u540e\u540d\u79f0", "\u66ff\u6362\u540d\u79f0", "\u56fe\u4e2d\u540d\u79f0",
  ]);

  function normalizeHeader(value) {
    return String(value ?? "").trim().toLowerCase().replace(/[\s_.-]+/g, "");
  }

  function parseDelimitedText(text, delimiter = null) {
    const source = String(text ?? "").replace(/^\uFEFF/, "");
    const firstPhysicalLine = source.split(/\r?\n/, 1)[0] || "";
    const separator = delimiter || (firstPhysicalLine.includes("\t") ? "\t" : ",");
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let index = 0; index < source.length; index++) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          cell += '"';
          index++;
        } else if (character === '"') {
          quoted = false;
        } else {
          cell += character;
        }
        continue;
      }
      if (character === '"') {
        quoted = true;
      } else if (character === separator) {
        row.push(cell);
        cell = "";
      } else if (character === "\n") {
        row.push(cell.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += character;
      }
    }
    if (quoted) throw new Error("Unclosed double quote in label mapping table");
    if (cell || row.length) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
    }
    return rows;
  }

  function rowsToMapping(inputRows) {
    const rows = (inputRows || [])
      .map(row => (row || []).map(value => String(value ?? "").trim()))
      .filter(row => row.some(Boolean));
    if (!rows.length) throw new Error("Label mapping table is empty");
    const header = rows[0].map(normalizeHeader);
    const sourceColumn = header.findIndex(value => SOURCE_HEADERS.has(value));
    const displayColumn = header.findIndex(value => DISPLAY_HEADERS.has(value));
    const hasHeader = sourceColumn >= 0 && displayColumn >= 0;
    if ((sourceColumn >= 0) !== (displayColumn >= 0)) {
      throw new Error("Incomplete mapping header: both original_name and display_name columns are required");
    }
    const sourceIndex = hasHeader ? sourceColumn : 0;
    const displayIndex = hasHeader ? displayColumn : 1;
    const mapping = Object.create(null);
    const duplicates = [];
    rows.slice(hasHeader ? 1 : 0).forEach((row, rowIndex) => {
      const originalName = String(row[sourceIndex] ?? "").trim();
      const displayName = String(row[displayIndex] ?? "").trim();
      if (!originalName && !displayName) return;
      if (!originalName) throw new Error(`Missing original tip name at row ${rowIndex + (hasHeader ? 2 : 1)}`);
      if (!displayName) return;
      if (Object.hasOwn(mapping, originalName) && mapping[originalName] !== displayName) duplicates.push(originalName);
      mapping[originalName] = displayName;
    });
    if (duplicates.length) throw new Error(`Conflicting display labels mapped for the same original tip: ${[...new Set(duplicates)].join(", ")}`);
    if (!Object.keys(mapping).length) throw new Error("No display names were provided in the mapping table");
    return mapping;
  }

  function xmlDocument(text, label) {
    const document = new DOMParser().parseFromString(text, "application/xml");
    if (document.querySelector("parsererror")) throw new Error(`Failed to parse ${label} XML`);
    return document;
  }

  function columnIndex(reference) {
    const letters = String(reference || "").match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
    return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  }

  async function parseXlsxArrayBuffer(arrayBuffer) {
    if (!global.JSZip) throw new Error("Excel reader library failed to load; please reload the page and try again");
    const zip = await global.JSZip.loadAsync(arrayBuffer);
    const workbookFile = zip.file("xl/workbook.xml");
    const relationshipsFile = zip.file("xl/_rels/workbook.xml.rels");
    if (!workbookFile || !relationshipsFile) throw new Error("File is not a valid Excel .xlsx workbook");
    const [workbookText, relationshipsText] = await Promise.all([
      workbookFile.async("text"), relationshipsFile.async("text"),
    ]);
    const workbook = xmlDocument(workbookText, "workbook");
    const relationships = xmlDocument(relationshipsText, "workbook relationships");
    const relationTargets = new Map([...relationships.getElementsByTagName("Relationship")].map(node => [
      node.getAttribute("Id"), node.getAttribute("Target"),
    ]));
    const sheet = workbook.getElementsByTagName("sheet")[0];
    const relationshipId = sheet?.getAttribute("r:id")
      || sheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = relationTargets.get(relationshipId);
    if (!target) throw new Error("No readable worksheet found in the Excel workbook");
    const normalizedTarget = target.startsWith("/")
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, "")}`.replace(/\/[^/]+\/\.\.\//g, "/");
    const sheetFile = zip.file(normalizedTarget);
    if (!sheetFile) throw new Error("First worksheet content is missing from the Excel workbook");

    const sharedStrings = [];
    const sharedFile = zip.file("xl/sharedStrings.xml");
    if (sharedFile) {
      const sharedDocument = xmlDocument(await sharedFile.async("text"), "shared strings");
      [...sharedDocument.getElementsByTagName("si")].forEach(item => {
        sharedStrings.push([...item.getElementsByTagName("t")].map(node => node.textContent || "").join(""));
      });
    }
    const worksheet = xmlDocument(await sheetFile.async("text"), "worksheet");
    return [...worksheet.getElementsByTagName("row")].map(rowNode => {
      const row = [];
      [...rowNode.getElementsByTagName("c")].forEach(cellNode => {
        const index = columnIndex(cellNode.getAttribute("r"));
        const type = cellNode.getAttribute("t");
        let value = "";
        if (type === "inlineStr") {
          value = [...cellNode.getElementsByTagName("t")].map(node => node.textContent || "").join("");
        } else {
          const raw = cellNode.getElementsByTagName("v")[0]?.textContent || "";
          value = type === "s" ? (sharedStrings[Number(raw)] ?? "") : raw;
        }
        row[index] = value;
      });
      return row;
    });
  }

  async function parseMappingFile(file) {
    const name = String(file?.name || "").toLowerCase();
    if (name.endsWith(".xlsx")) return rowsToMapping(await parseXlsxArrayBuffer(await file.arrayBuffer()));
    if (name.endsWith(".xls")) throw new Error("Legacy .xls files are not supported; please save as .xlsx, CSV, or TSV");
    const delimiter = name.endsWith(".tsv") ? "\t" : null;
    return rowsToMapping(parseDelimitedText(await file.text(), delimiter));
  }

  global.PhyloRenderTipLabelMapping = Object.freeze({
    parseDelimitedText,
    rowsToMapping,
    parseXlsxArrayBuffer,
    parseMappingFile,
  });
})(globalThis);
