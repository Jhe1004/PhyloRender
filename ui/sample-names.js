(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PhyloRenderSampleNamesWorkbench=api;
})(globalThis,function(){
  "use strict";
  function create(ports) {
    for(const name of ['createElement','baseLabel','displayLabel','syncTipSize','renderTree','recognize','requestSettingsRender',
      'showMessage','parseMappingFile','downloadTemplate','deferFocus','canRenameFromFigure'])
      if(typeof ports?.[name]!=='function')throw new TypeError('Missing sample-name workbench port: '+name);
    if(!ports.elements||!ports.names)throw new TypeError('Missing sample-name elements or operations');
    const {elements,names,createElement,baseLabel,displayLabel,syncTipSize,renderTree,recognize,requestSettingsRender,
      showMessage,parseMappingFile,downloadTemplate,deferFocus,canRenameFromFigure}=ports;
    for(const name of ["select","list","status","clear","edit","mappingFile","template","original","input","restore","dialog","form","cancel","svg","family","color","size","bold","italic","normalize","follow","rankStatus","taxonStatus"])
      if(!elements[name])throw new TypeError('Missing sample-name element: '+name);
    let bound=false;
    const listeners=[];
    function listen(element,type,callback){element.addEventListener(type,callback);listeners.push([element,type,callback]);}
function captureTipPresentation() {
  return {
    family: elements.family.value, color: elements.color.value,
    size: Number(elements.size.value), bold: elements.bold.checked,
    italic: elements.italic.value, normalizeRanks: elements.normalize.checked,
    follow: elements.follow ? elements.follow.checked : true,
  };
}


function restoreTipPresentation(presentation) {
  if (!presentation) return;
  elements.family.value = presentation.family;
  elements.color.value = presentation.color;
  elements.bold.checked = presentation.bold;
  elements.italic.value = presentation.italic;
  elements.normalize.checked = presentation.normalizeRanks;
  if (elements.follow && typeof presentation.follow === "boolean") elements.follow.checked = presentation.follow;
  syncTipSize(presentation.size);
}


function updateRankNormalizationStatus(tipGroup) {
  const status = elements.rankStatus;
  if (!elements.normalize.checked) {
    status.textContent = "Disabled: infraspecific rank tokens remain as written in the tree file.";
    status.classList.remove("active");
    return;
  }
  const changed = [...tipGroup.children].reduce((sum, label) => sum + Number(label.getAttribute("data-rank-change-count") || 0), 0);
  status.textContent = changed
    ? `Standardized ${changed} rank token(s) to ICN abbreviations (display only).`
    : "Enabled: no infraspecific rank tokens require standardization.";
  status.classList.add("active");
}


function updateTaxonNameStatus(message, kind = "") {
  const status = elements.taxonStatus;
  status.textContent = message;
  status.classList.toggle("ready", kind === "ready");
  status.classList.toggle("fallback", kind === "fallback");
}


function taxonNameEngineMessage(labelCount, analysis) {
  const parts = [];
  if (analysis.engine.includes("gnfinder")) {
    parts.push(`GNfinder ${analysis.versions.gnfinder || ""} detected ${analysis.recognized}/${labelCount}`.replace(/\s+/g, " "));
  }
  if (analysis.engine.includes("gnparser")) {
    parts.push(`GNparser ${analysis.versions.gnparser || ""} parsed ${analysis.parsed}/${labelCount}`.replace(/\s+/g, " "));
  }
  return `${parts.join("; ")}. Raw tip identities remain unchanged; botanical authorities stay upright.`;
}


function renderTipLabelMappingControls() {
  const select = elements.select;
  if (!select) return;
  const overrides = names.snapshot().overrides;
  const originals = names.snapshot().originals;
  const previous = select.value;
  select.replaceChildren(...originals.map(raw => {
    const option = createElement("option");
    option.value = raw;
    const display = displayLabel(raw);
    option.textContent = overrides.has(raw) ? `${display}  ←  ${baseLabel(raw)}` : display;
    return option;
  }));
  if (originals.includes(previous)) select.value = previous;
  const list = elements.list;
  list.replaceChildren();
  [...overrides.entries()].sort((a, b) => baseLabel(a[0]).localeCompare(baseLabel(b[0]))).forEach(([raw, display]) => {
    const row = createElement("div");
    row.className = "tip-map-item";
    row.dataset.originalTipLabel = raw;
    const names = createElement("div");
    names.className = "tip-map-item-names";
    const original = createElement("small");
    original.textContent = baseLabel(raw);
    const renamed = createElement("strong");
    renamed.textContent = display;
    names.append(original, renamed);
    const actions = createElement("div");
    actions.className = "tip-map-item-actions";
    const edit = createElement("button");
    edit.type = "button";
    edit.className = "button compact";
    edit.dataset.action = "edit";
    edit.textContent = "Edit";
    const remove = createElement("button");
    remove.type = "button";
    remove.className = "button compact";
    remove.dataset.action = "remove";
    remove.textContent = "Reset";
    actions.append(edit, remove);
    row.append(names, actions);
    list.append(row);
  });
  const count = overrides.size;
  elements.status.textContent = count
    ? `Overridden ${count} / ${originals.length} tip label(s)`
    : "Showing all original tip labels";
  elements.clear.disabled = count === 0;
  elements.edit.disabled = originals.length === 0;
}


function openTipRenameDialog(rawLabel) {
  const raw = names.resolve(rawLabel);
  if (!raw) return;
  names.setPending(raw);
  elements.original.textContent = baseLabel(raw);
  elements.input.value = names.snapshot().overrides.get(raw) || baseLabel(raw);
  elements.restore.disabled = !names.snapshot().overrides.has(raw);
  elements.dialog.showModal();
  deferFocus(() => {
    elements.input.focus();
    elements.input.select();
  });
}


function closeTipRenameDialog() {
  names.setPending(null);
  elements.dialog.close();
}



function applyTipLabelOverrides(overrides,{mode="merge",render=true,message=true}={}) {
  const result=names.apply(overrides,mode);
  renderTipLabelMappingControls();
  if(render){renderTree();recognize({force:true});}
  if(message)showMessage(result.changedCount?`Updated display labels for ${result.changedCount} tip(s)`:"No display label changes to apply");
  return result.overrides;
}
function removeTipLabelOverride(rawLabel,{render=true}={}) {
  if(!names.remove(rawLabel))return false;
  renderTipLabelMappingControls();
  if(render){renderTree();recognize({force:true});}
  return true;
}
function clearTipLabelOverrides({render=true,message=true}={}) {
  const count=names.clear();
  renderTipLabelMappingControls();
  if(render){renderTree();recognize({force:true});}
  if(message)showMessage(count?`Restored original labels for ${count} tip(s)`:"All tips already use their original labels");
}

    function bind() {
      if(bound)return;
      bound=true;
  listen(elements.edit, "click", () => openTipRenameDialog(elements.select.value));
  listen(elements.template, "click", downloadTemplate);
  listen(elements.clear, "click", () => clearTipLabelOverrides());
  listen(elements.mappingFile, "change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const mapping = await parseMappingFile(file);
      applyTipLabelOverrides(mapping, { mode: "merge" });
      showMessage(`Imported and updated ${Object.keys(mapping).length} tip label(s) from ${file.name}`);
    } catch (error) {
      showMessage(`Label mapping table not applied: ${error.message}`, true);
    } finally {
      event.target.value = "";
    }
  });
  listen(elements.list, "click", event => {
    const button = event.target.closest("button[data-action]");
    const row = button?.closest(".tip-map-item");
    if (!button || !row) return;
    const raw = row.dataset.originalTipLabel;
    if (button.dataset.action === "edit") openTipRenameDialog(raw);
    if (button.dataset.action === "remove") {
      removeTipLabelOverride(raw);
      showMessage(`Restored original label for ${baseLabel(raw)}`);
    }
  });
  listen(elements.input, "input", () => {
    elements.input.setCustomValidity?.("");
  });
  listen(elements.form, "submit", event => {
    event.preventDefault();
    const raw = names.pending();
    if (!raw) return closeTipRenameDialog();
    try {
      elements.input.setCustomValidity?.("");
      applyTipLabelOverrides({ [raw]: elements.input.value }, { mode: "merge" });
      closeTipRenameDialog();
    } catch (error) {
      elements.input.setCustomValidity?.(error.message || "Invalid label");
      elements.input.reportValidity?.();
      showMessage(error.message, true);
    }
  });
  listen(elements.cancel, "click", closeTipRenameDialog);
  listen(elements.restore, "click", () => {
    const raw = names.pending();
    if (raw) {
      removeTipLabelOverride(raw);
      showMessage(`Restored original label for ${baseLabel(raw)}`);
    }
    closeTipRenameDialog();
  });
  listen(elements.dialog, "cancel", event => {
    event.preventDefault();
    closeTipRenameDialog();
  });
  listen(elements.svg, "dblclick", event => {
    if (!canRenameFromFigure()) return;
    const label = event.target.closest?.(".tip-label[data-original-tip-label], .cloud-tip-label[data-original-tip-label], .conflict-tip-label[data-original-tip-label]");
    if (!label) return;
    event.preventDefault();
    event.stopPropagation();
    openTipRenameDialog(label.getAttribute("data-original-tip-label"));
  });

      for(const element of [elements.family,elements.bold,elements.follow])listen(element,'change',requestSettingsRender);
      listen(elements.italic,'change',()=>{
        requestSettingsRender();
        if(elements.italic.value==='auto')recognize();
      });
      listen(elements.normalize,'change',()=>{
        names.invalidateRanks();
        requestSettingsRender();
        recognize();
      });
      listen(elements.color,'input',event=>{
        // Colour alone changes no glyph geometry and starts no scientific job.
        elements.svg.style.setProperty('--tip-color',event.target.value);
      });
    }
    function dispose(){for(const [element,type,callback]of listeners)element.removeEventListener(type,callback);listeners.length=0;bound=false;}
    return Object.freeze({capturePresentation:captureTipPresentation,restorePresentation:restoreTipPresentation,
      renderMappingControls:renderTipLabelMappingControls,applyOverrides:applyTipLabelOverrides,removeOverride:removeTipLabelOverride,
      clearOverrides:clearTipLabelOverrides,openRename:openTipRenameDialog,closeRename:closeTipRenameDialog,
      updateRankStatus:updateRankNormalizationStatus,updateTaxonStatus:updateTaxonNameStatus,engineMessage:taxonNameEngineMessage,bind,dispose});
  }
  return Object.freeze({create});
});
