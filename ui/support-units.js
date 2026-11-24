/* One support-source unit selector, with explicit elements and callbacks. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderSupportUnits=api;})(globalThis,function(){
  'use strict';
  function ensureOption(select,value,createOption){
    if(typeof value!=='string'||value.length>1000||!value.split('/').every(unit=>['auto','probability','percent'].includes(unit)))throw new Error('Branch support scale must be auto, probability, or percent; separate per-column scales with "/"');
    if(![...select.options].some(option=>option.value===value))select.append(createOption('Per column: '+value.split('/').map(unit=>({auto:'Auto',probability:'Probability (0–1)',percent:'Percentage (0–100)'})[unit]).join(' / '),value));
  }
  function append({parent,createElement,name,value='auto',validate,commit,onError}){
    const label=createElement('label'),select=createElement('select');
    label.textContent='Support scale';select.setAttribute('aria-label',`Support scale for ${name}`);
    for(const [key,text] of [['auto','Auto-detect per column'],['probability','Probability (0–1)'],['percent','Percentage (0–100)'],['probability/percent','Per column: Probability / Percentage'],['percent/probability','Per column: Percentage / Probability']]){
      const option=createElement('option');option.value=key;option.textContent=text;select.append(option);
    }
    ensureOption(select,value,(text,key)=>{const option=createElement('option');option.value=key;option.textContent=text;return option;});
    let current=value;select.value=current;
    const change=()=>{
      try{validate(select.value);commit(select.value);current=select.value;}
      catch(error){select.value=current;onError(error);}
    };
    select.addEventListener('change',change);label.append(select);parent.append(label);
    return Object.freeze({element:select,dispose:()=>select.removeEventListener('change',change)});
  }
  return Object.freeze({append,ensureOption});
});
