(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PhyloRenderSampleNameState=api;
})(globalThis,function(){
  "use strict";
  // These ports select a document's naming fields; no tree or whole document is received.
  function create(ports) {
    for(const name of ['readOriginals','readOverrides','replaceOverrides','invalidateRecognition',
      'readPending','writePending','invalidateAllRecognition']) {
      if(typeof ports?.[name]!=='function')throw new TypeError('Missing sample-name operation port: '+name);
    }
    const identity=ports.identity;
    for(const name of ['resolveTipOriginalName','validateTipLabelOverrides','baseTipDisplayLabel']) {
      if(typeof identity?.[name]!=='function')throw new TypeError('Missing sample-name identity dependency: '+name);
    }
    const {readOriginals,readOverrides,replaceOverrides,invalidateRecognition,readPending,writePending,invalidateAllRecognition}=ports;
    function snapshot() { return {originals:[...readOriginals()],overrides:new Map(readOverrides())}; }
    function serialized() { return Object.fromEntries([...readOverrides().entries()].sort((a,b)=>a[0].localeCompare(b[0]))); }
    function resolve(candidate) { return identity.resolveTipOriginalName(candidate,readOriginals()); }
    function validate(overrides) { return identity.validateTipLabelOverrides(overrides,readOriginals()); }
    function apply(overrides,mode='merge') {
      // Validate the entire batch before changing any field; preserve legacy merge semantics.
      const canonical=validate(overrides);
      const next=mode==='replace'?new Map():new Map(readOverrides());
      canonical.forEach((display,raw)=>{
        if(display===identity.baseTipDisplayLabel(raw))next.delete(raw);
        else next.set(raw,display);
      });
      replaceOverrides(next);
      invalidateRecognition();
      return {changedCount:canonical.size,overrides:serialized()};
    }
    function remove(candidate) {
      const raw=resolve(candidate),overrides=readOverrides();
      if(!raw||!overrides.has(raw))return false;
      overrides.delete(raw);
      invalidateRecognition();
      return true;
    }
    function clear() {
      const overrides=readOverrides(),count=overrides.size;
      overrides.clear();
      invalidateRecognition();
      return count;
    }
    function pending() { return readPending(); }
    function setPending(raw) { writePending(raw); }
    function invalidateRanks() { invalidateAllRecognition(); }
    return Object.freeze({snapshot,serialized,resolve,validate,apply,remove,clear,pending,setPending,invalidateRanks});
  }
  return Object.freeze({create});
});
