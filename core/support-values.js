/* Source-wide support columns, raw cutoffs and precision-aware full-support drawing. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderSupportValues=api;})(globalThis,function(){
  'use strict';
  function create(scaleModel){
    if(!scaleModel?.fromValues||!scaleModel?.resolve)throw new TypeError('Missing support-scale model');
    const parts=value=>String(value??'').split('/').map(part=>part.trim());
    function normalized(raw,scale){
      if(raw===''||!Number.isFinite(Number(raw)))return null;
      const value=Number(raw),maximum=scale==='percent'?100:1;
      if(value<0||value>maximum)throw Object.assign(new Error(`Support value ${raw} exceeds the selected ${scale} scale [0, ${maximum}]`),{code:'SUPPORT_VALUE_INVALID'});
      return value/maximum;
    }
    function profile(values,declared='auto'){
      const columns=[];
      for(const value of values)parts(value).forEach((part,index)=>(columns[index]||=[]).push(part));
      const units=String(declared).split('/');
      units.forEach(unit=>scaleModel.resolve(scaleModel.empty(),unit));
      if(columns.length&&units.length>1&&units.length!==columns.length)throw Object.assign(new Error('Number of per-column support scales does not match the number of slash-delimited support columns'),{code:'SUPPORT_SCALE_INVALID'});
      return columns.map((column,index)=>{
        const scale=scaleModel.resolve(scaleModel.fromValues(column),units.length===1?units[0]:units[index]);
        column.forEach(value=>normalized(value,scale));return scale;
      });
    }
    function classified(value,scales){
      const selected=scales||profile([value]);
      return parts(value).map((raw,index)=>{
        if(!selected[index])throw Object.assign(new Error('Branch support column has no resolved scale'),{code:'SUPPORT_SCALE_AMBIGUOUS'});
        const value=normalized(raw,selected[index]);
        return {raw,value:value===null?null:Number(raw),maximum:selected[index]==='percent'?100:1};
      });
    }
    function profileTree(tree,{getValue,declared='auto'}){
      const values=[];
      (function visit(node,isRoot){
        if(node.children?.length){if(!isRoot)values.push(getValue(node));node.children.forEach(child=>visit(child,false));}
      })(tree,true);
      return profile(values.filter(value=>value!==null&&value!==undefined),declared);
    }
    function resolveDigits(entry,digits){
      if(digits===null||digits===undefined||digits==='original')return null;
      if(digits==='auto')return entry.maximum===100?0:2;
      return digits;
    }
    const displayNumber=(entry,digits)=>{const d=resolveDigits(entry,digits);return d===null?entry.raw:entry.value.toFixed(d);};
    const full=(value,scales,digits=null)=>{
      const entries=classified(value,scales);
      return entries.length>0&&entries.every(entry=>entry.value!==null&&Number(displayNumber(entry,digits))===entry.maximum);
    };
    const under=(entry,threshold)=>entry.value!==null&&entry.value<(entry.maximum===100?threshold:threshold/100);
    const below=(value,threshold,scales)=>threshold>0&&classified(value,scales).some(entry=>under(entry,threshold));
    function format(value,threshold=0,digits=null,scales){
      return classified(value,scales).map(entry=>{
        if(entry.value===null)return entry.raw;
        if(threshold>0&&under(entry,threshold))return '–';
        return displayNumber(entry,digits);
      }).join('/');
    }
    return Object.freeze({profile,profileTree,full,below,format});
  }
  return Object.freeze({create});
});
