/* Stage 82: explicit module boundary; browser and Node share this implementation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderDocumentState=api;})(globalThis,function(){
"use strict";
function createDocument({ sourceName = "" } = {}) {
const state = {
  horizontalLayoutCache: undefined,
  manualTreeAxes: undefined,
  tipSpacingEm: 1.05,
  automaticTipSpacing: true,
  tipLayoutByMode: new Map(),
  // The user chooses the drawing mode explicitly. Detection only supplies a
  // compatibility hint and must never move the user to another workspace.
  workspaceMode: "phylogeny",
  timeDetectionReason: null,
  // Stored in the raw age unit of the imported tree so changing the display
  // unit never changes which biological nodes are selected.
  timeAgeRange: { minimumRaw: null, maximumRaw: null, explicit: false },
  conflict: {
    nuclearRoot: null,
    plastidRoot: null,
    primaryDisplayRoot: null,
    pendingSwapNodeId: null,
    nuclearName: "",
    plastidName: "",
    nuclearText: "",
    plastidText: "",
    supportFieldSelections: { nuclear: "all", plastid: "all" },
    groupAssignments: null,
    groupFileName: "",
    policy: "",
    prepared: null,
    taxonNameMatches: new Map(),
    taxonNameParses: new Map(),
    taxonNameRequestKey: "",
    taxonNameRequestToken: 0,
    taxonNameEngine: "browser-rules",
    taxonNameVersions: {},
    taxonNameRecognizedCount: 0,
    taxonNameParsedCount: 0,
  },
  cloud: {
    speciesRoot: null, speciesName: "", speciesText: "", geneName: "", geneRoots: [],
    geneAudit: null, phyPartsName: "", phyPartsTable: null,
    geneFile: null, phyPartsText: "", phyPartsMeta: null, phyPartsBusy: false,
    hiddenPieNodes: new Set(),
    pieAgeRange: { minimum: null, maximum: null },
    datedAges: new Map(), datedRootAge: null, datingEngine: null,
    importedDating: null, geneDatingEngine: null,
    treePLSeed: null, treePLRuns: null,
    cladeColors: new Map(), cladeNames: new Map(),
    cladeNameSegments: new Map(), cladeNameOrientations: new Map(),
    cladeBarStyles: new Map(), cladeTiers: new Map(),
    tipLabelOverrides: new Map(),
    taxonNameMatches: new Map(), taxonNameParses: new Map(),
    taxonNameRequestKey: "", taxonNameRequestToken: 0,
    taxonNameEngine: "browser-rules", taxonNameVersions: {},
    taxonNameRecognizedCount: 0, taxonNameParsedCount: 0,
    tipPresentation: null,
  },
  nonCloudTipPresentation: null,
  cladePresentationByMode: new Map(),
  settingsPage: "data",
  parsedRoot: null,
  root: null,
  graph: null,
  sourceName: sourceName,
  zoom: 1,
  viewportFitMode: "width",
  manualLabels: new Map(),
  tipLabelOverrides: new Map(),
  pendingTipRenameRawLabel: null,
  cladeColors: new Map(),
  cladeNames: new Map(),
  cladeNameSegments: new Map(),
  cladeNameOrientations: new Map(),
  cladeBarStyles: new Map(),
  cladeTiers: new Map(),
  cladeSelectionMode: false,
  pendingCladeNodeId: null,
  pendingCladeNameSegments: [],
  pendingRootCladeNodeId: null,
  labelPlacements: [],
  branchSegments: [],
  currentSvgSize: { width: 900, height: 500 },
  currentLayoutInfo: null,
  currentBranchLengthDisplay: null,
  nodeDataSources: [],
  nextNodeDataSourceId: 1,
  mainSupportCount: 0,
  mainSupportValues: new Map(),
  taxonNameMatches: new Map(),
  taxonNameParses: new Map(),
  taxonNameRequestKey: "",
  taxonNameRequestToken: 0,
  taxonNameEngine: "browser-rules",
  taxonNameVersions: {},
  taxonNameRecognizedCount: 0,
  taxonNameParsedCount: 0,
  // Preserve the full-tree time scale across paginated panels so continuation subtrees are not rescaled.
  printTimeAxisMaximum: null,
};
return Object.seal(state);
}

const DERIVED_FIELDS=Object.freeze(["labelPlacements","branchSegments","currentLayoutInfo"]);
function capture(documentState) { const omitted=new Set(DERIVED_FIELDS); return structuredClone(Object.fromEntries(Object.entries(documentState).filter(([key])=>!omitted.has(key)))); }
function restore(documentState, snapshot) {
 const expected=Object.keys(documentState).filter(key=>!DERIVED_FIELDS.includes(key)).sort();
 const actual=Object.keys(snapshot).sort();
 if(JSON.stringify(expected)!==JSON.stringify(actual)) throw Object.assign(new Error("Incomplete document snapshot"),{code:"DOCUMENT_SNAPSHOT_INVALID"});
 Object.assign(documentState, structuredClone(snapshot)); return documentState;
}

return Object.freeze({createDocument,capture,restore,DERIVED_FIELDS});
});
