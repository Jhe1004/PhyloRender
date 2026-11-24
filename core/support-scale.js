/* Explicit support-unit evidence; trees are read-only and inputs are explicit. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderSupportScale=api;})(globalThis,function(){
  'use strict';
  const empty=()=>({percentage:false,probability:false,unitValue:false});
  const merge=(left,right)=>({percentage:left.percentage||right.percentage,
    probability:left.probability||right.probability,unitValue:left.unitValue||right.unitValue});
  function observe(evidence,raw){
    const text=String(raw??'').trim(),value=Number(text);
    if(!text||!Number.isFinite(value))return;
    if(value<0||value>100)throw Object.assign(new Error('Branch support value falls outside the valid [0, 100] range'),{code:'SUPPORT_VALUE_INVALID'});
    evidence.percentage||=value>1;evidence.probability||=value>0&&value<1;evidence.unitValue||=value===1;
  }
  function fromValues(values){const evidence=empty();for(const value of values)observe(evidence,value);return evidence;}
  function collect(tree,{field='last',getSupport=node=>node.support??node.label}={}){
    const evidence=empty();
    function visit(node,isRoot){
      if(!node.children?.length)return;
      // The root has no incoming branch and its support is not evidence.
      if(!isRoot){
        const parts=String(getSupport(node)??'').trim().split('/');
        observe(evidence,parts[field==='first'?0:parts.length-1]);
      }
      node.children.forEach(child=>visit(child,false));
    }
    visit(tree,true);return evidence;
  }
  function resolve(evidence,declared='auto'){
    if(!['auto','probability','percent'].includes(declared))throw Object.assign(new Error('Unknown branch support scale'),{code:'SUPPORT_SCALE_INVALID'});
    if(declared!=='auto')return declared;
    if(evidence.probability||evidence.unitValue&&!evidence.percentage)
      throw Object.assign(new Error('Ambiguous or mixed branch support scale: values in [0, 1] may represent probabilities or low percentages; please explicitly select probability (0–1) or percentage (0–100)'),{code:'SUPPORT_SCALE_AMBIGUOUS'});
    return evidence.percentage?'percent':'probability';
  }
  function decimal(value){
    // The safe statistics dialect has no exponent token. Expand the shortest
    // round-trip decimal instead of rounding a value near a support cutoff.
    return String(value).replace(/^(\d)(?:\.(\d+))?e-(\d+)$/,
      (_match,integer,fraction='',exponent)=>'0.'+'0'.repeat(Number(exponent)-1)+integer+fraction);
  }
  return Object.freeze({policy:'support-units-v3-explicit-ambiguous',empty,merge,fromValues,collect,resolve,decimal});
});
