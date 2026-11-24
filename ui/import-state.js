/* A snapshot of one workspace operation, through explicit model and UI ports. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderImportState=api;})(globalThis,function(){
"use strict";
function create({captureModel,restoreModel,readControls,readDetails,readLabels,captureExtra,restoreExtra,sync,redraw}) {
  function capture() {
    return {
      model:captureModel(),extra:captureExtra(),
      controls:readControls().map(element=>({element,value:element.value,checked:element.checked,
        disabled:element.disabled,options:element.tagName==="SELECT"?element.innerHTML:null})),
      details:readDetails().map(element=>({element,open:element.open})),
      labels:readLabels().map(element=>({element,text:element.textContent})),
    };
  }
  async function restore(snapshot) {
    restoreModel(snapshot.model); restoreExtra(snapshot.extra);
    for(const {element,value,checked,disabled,options} of snapshot.controls) {
      if(options!==null)element.innerHTML=options;
      element.value=value;element.checked=checked;element.disabled=disabled;
    }
    sync();
    for(const {element,open} of snapshot.details)element.open=open;
    await redraw();
    for(const {element,text} of snapshot.labels)element.textContent=text;
  }
  return Object.freeze({capture,restore});
}
return Object.freeze({create});
});
