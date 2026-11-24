/* Pure scientific preparation, shared by the Worker and regression tests. */
(function(root,factory){const api=factory(
  typeof module==='object'&&module.exports?require('./tree-input.js'):root.PhyloRenderInput,
  typeof module==='object'&&module.exports?require('../cloud-tree.js'):root.PhyloRenderCloud,
  typeof module==='object'&&module.exports?require('../cloud-tree.js').geneRooting:root.PhyloRenderCloud.geneRooting,
  typeof module==='object'&&module.exports?require('./support-scale.js'):root.PhyloRenderSupportScale);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PhyloRenderGenePreparation=api;
})(globalThis,function(input,cloud,geneRooting,supportScale){
  'use strict';
  const MAX_OVERLAY_NODES=30000, MAX_RENDER_TIPS=1500;
  function assertRenderable(root){
    const count=cloud.tips(root).length;
    if(count>MAX_RENDER_TIPS) throw Object.assign(new Error(`Tree contains ${count} tips, exceeding the interactive rendering limit of ${MAX_RENDER_TIPS}; import aborted without pruning taxa. Please extract a focal subtree first.`),{code:'RENDER_COMPLEXITY_LIMIT'});
    return root;
  }
  function payload(speciesRoot,genes,names,options={}){
    const getSupport=node=>Object.hasOwn(node,'support')?node.support:input.supportFromNode(node);
    const scale=cloud.phyPartsSupportScale(genes,{...options,getSupport});
    return {scale,support_unit_policy:supportScale.policy,payload:{species:cloud.phyPartsInput(speciesRoot,names,{getSupport:()=>null}),
      genes:genes.map(root=>cloud.phyPartsInput(root,names,{...options,scale,getSupport})),
      names,threshold:options.threshold||0,mode:'four'}};
  }
  function batchScale(lines,speciesRoot,rootPolicy,outgroups,field,getSupport,filename,progress){
    let evidence=supportScale.empty(),nodes=0;
    for(const [index,raw] of lines.entries()){
      try{
        const tree=input.parseNewick(raw);
        (function count(node){nodes++;node.children.forEach(count);})(tree);
        if(nodes>10000000)throw Object.assign(new Error('Total node count across gene trees exceeds the 10,000,000 safety limit'),{code:'TREE_INPUT_LIMIT'});
        if(cloud.phyPartsEligibility(speciesRoot,tree,{rootPolicy,outgroups}).accepted)
          evidence=supportScale.merge(evidence,supportScale.collect(tree,{field,getSupport}));
      }catch(error){
        if(['TREE_SINGLE_CHILD_NODE','TREE_INPUT_LIMIT','SUPPORT_VALUE_INVALID'].includes(error.code))
          throw Object.assign(new Error(`Gene tree #${index+1} in ${filename}: ${error.message}; aborted without partial gene-tree statistics.`),{code:error.code});
        // Ordinary invalid/excluded trees are audited in the preparation pass.
      }
      if(index%80===0)progress({phase:'support_scale',current:index+1,total:lines.length,accepted:0});
    }
    return supportScale.resolve(evidence);
  }
  function prepare({text,speciesRoot,filename,rootPolicy,outgroups=[],canCloud,field='last',scale='auto',threshold=0},progress=()=>{}){
    if(typeof text!=='string'||text.length>120000000)throw Object.assign(new Error('Gene-tree collection exceeds the 120 MB text safety limit'),{code:'TREE_INPUT_LIMIT'});
    const lines=cloud.splitGeneTrees(text);
    if(!lines.length||lines.length>20000)throw new Error('Gene-tree file must contain between 1 and 20,000 Newick trees');
    const names=cloud.sampleProfile(speciesRoot).names;
    geneRooting.selection(speciesRoot,{rootPolicy,outgroups});
    const accepted=[], genes=[], audit={total:0,accepted:0,mismatch:0,invalid:0,mlRejected:0,
      stats:{accepted:0,unrootable:0,unknown:0},firstRejected:null,trees:[]};
    let overlayNodes=0,totalNodes=0,cloudLimitError='';
    const support=node=>Object.hasOwn(node,'support')?node.support:input.supportFromNode(node);
    // Resolve the whole comparable batch without retaining a parsed forest.
    // The Worker reparses one tree at a time only after a scale is established.
    const effectiveScale=scale==='auto'?batchScale(lines,speciesRoot,rootPolicy,outgroups,field,support,filename,progress):supportScale.resolve(supportScale.empty(),scale);
    for(const [index,raw] of lines.entries()){
      const line=raw.trim();if(!line||line.startsWith('#'))continue;
      audit.total++;
      const row={index:index+1,statistics:false,cloud:false,reason:null};audit.trees.push(row);
      try{
        let root=input.parseNewick(line);
        let nodeCount=0;(function count(node){nodeCount++;node.children.forEach(count);})(root);
        totalNodes+=nodeCount;
        if(totalNodes>10000000)throw Object.assign(new Error('Total node count across gene trees exceeds the 10,000,000 safety limit; partial statistics were not used'),{code:'TREE_INPUT_LIMIT'});
        const eligibility=cloud.phyPartsEligibility(speciesRoot,root,{rootPolicy,outgroups});
        if(!eligibility.accepted){
          row.reason=eligibility.reason;
          if(eligibility.category==='invalid')audit.invalid++;else audit.stats[eligibility.category]++;
          audit.firstRejected||={line:index+1,reason:row.reason};
        }else{
          root=geneRooting.orient(root,eligibility);
          try{genes.push(cloud.phyPartsInput(root,names,{field,scale:effectiveScale,getSupport:support}));}
          catch(error){throw Object.assign(error,{code:'SUPPORT_VALUE_INVALID'});}
          audit.stats.accepted++;Object.assign(row,{statistics:true,root_policy:rootPolicy,outgroup:eligibility.outgroup||null,exact_tip_set:eligibility.exact,
            ...(eligibility.outgroups?{outgroups:eligibility.outgroups}: {})});
          if(!eligibility.exact)audit.mismatch++;
          else if(canCloud){
            try{
              cloud.validateMlInput(root,{method:'ml',filename,rawText:line});cloud.relativeAges(root,10);
              audit.accepted++;row.cloud=true;row.cloud_eligible=true;overlayNodes+=nodeCount;
              if(overlayNodes<=MAX_OVERLAY_NODES&&!cloudLimitError)accepted.push(root);
              else {accepted.length=0;cloudLimitError=`Full cloudogram overlay exceeds the interactive limit of ${MAX_OVERLAY_NODES} nodes; bipartition concordance statistics remain complete. Disable the cloudogram overlay or supply a smaller subset explicitly (trees are never subsampled automatically).`;}
            }catch(error){row.reason=error.message;audit.mlRejected++;audit.firstRejected||={line:index+1,reason:error.message};}
          }
        }
      }catch(error){
        if(['TREE_SINGLE_CHILD_NODE','TREE_INPUT_LIMIT','SUPPORT_SCALE_AMBIGUOUS','SUPPORT_VALUE_INVALID'].includes(error.code))throw Object.assign(new Error(`Gene tree #${index+1} in ${filename}: ${error.message}; aborted without partial gene-tree statistics.`),{code:error.code});
        row.reason=error.message;audit.invalid++;audit.firstRejected||={line:index+1,reason:error.message};
      }
      if(index%80===0)progress({current:index+1,total:lines.length,accepted:genes.length});
    }
    if(!genes.length)throw new Error(`No comparable rooted gene trees found (missing outgroup / unrootable: ${audit.stats.unrootable}; unmatched tips: ${audit.stats.unknown}; invalid / duplicate: ${audit.invalid})`);
    progress({current:lines.length,total:lines.length,accepted:genes.length});
    return {accepted,audit,names,cloudLimitError,totalNodes,scale:effectiveScale,support_unit_policy:supportScale.policy,
      payload:{species:cloud.phyPartsInput(speciesRoot,names,{getSupport:()=>null}),genes,names,threshold,mode:'four'}};
  }
  return {prepare,payload,assertRenderable,MAX_RENDER_TIPS,MAX_OVERLAY_NODES};
});
