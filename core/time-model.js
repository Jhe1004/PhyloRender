(function(root,factory){
  const node=typeof module==="object"&&module.exports;
  const api=factory(node?require("../cloud-tree.js"):root.PhyloRenderCloud,node?require("./tree-input.js"):root.PhyloRenderInput);
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderTimeModel=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(cloud,input){
  "use strict";
  function validHpd(range){
    return Array.isArray(range)&&range.length===2&&range.every(Number.isFinite)&&range[0]>=0&&range[1]>=range[0];
  }
  function annotationHpd(node){
    return input.validateTimeAnnotations(node).hpd;
  }
  function profile(root,{ageSource="auto",getAge=()=>null,getHpd=annotationHpd,diagnostics={}}={}){
    let selected;
    try {
      selected=cloud.importedDatedAges(root,{ageSource,getAge});
    } catch(error) {
      return {valid:false,rootAge:null,maximumAge:0,explicitAgeCount:0,hpdCount:0,derivedAgeCount:0,
        invalidAgeCount:1,sourceCounts:{height:0,height_mean:0,height_median:0},mixedExplicitSources:false,
        ageSource,diagnostics,validation_errors:[{code:error.code||"TIME_INVALID_TREE",message:error.message,field:error.field}],warnings:[]};
    }
    let explicitAgeCount=0,derivedAgeCount=0,hpdCount=0,maximumAge=selected.rootAge;
    const sourceCounts={height:0,height_mean:0,height_median:0};
    const invalid=[];
    function visit(node){
      const internal=node.children.length>0;
      node.timeAge=selected.ages.get(node);
      node.timeAgeSource=internal?selected.ageSource:"present";
      node.timeMean=internal?getAge(node,"height_mean"):null;
      node.timeMedian=internal?getAge(node,"height_median"):null;
      node.timeHpd=null;
      if(internal)try{node.timeHpd=getHpd(node);}catch(error){
        invalid.push({code:error.code||"TIME_INVALID_HPD",message:error.message,node_id:node.id,field:error.field});
      }
      if(internal){
        if(selected.ageSource==="branch_lengths")derivedAgeCount++;
        else {explicitAgeCount++;sourceCounts[selected.ageSource]++;}
      }
      if(node.timeHpd){
        if(!validHpd(node.timeHpd))
          invalid.push({code:"TIME_INVALID_HPD",message:"HPD credible interval must contain two finite, non-negative, non-decreasing bounds",node_id:node.id});
        else {hpdCount++;maximumAge=Math.max(maximumAge,node.timeHpd[1]);}
      }
      node.children.forEach(visit);
    }
    visit(root);
    return {valid:invalid.length===0,rootAge:selected.rootAge,maximumAge,explicitAgeCount,hpdCount,
      derivedAgeCount,invalidAgeCount:invalid.length,sourceCounts,mixedExplicitSources:false,
      ageSource:selected.ageSource,diagnostics,warnings:selected.warnings,validation_errors:invalid,
      ...(selected.terminalAgeValidation?{terminalAgeValidation:selected.terminalAgeValidation}:{})};
  }
  function assertValid(result){
    if(!result.valid){
      const first=result.validation_errors?.[0]||{code:"TIME_INVALID_TREE",message:"Invalid time-calibrated tree"};
      throw Object.assign(new Error(first.message),{code:first.code,issues:result.validation_errors});
    }
    return result;
  }
  return Object.freeze({profile,assertValid,annotationHpd});
});
