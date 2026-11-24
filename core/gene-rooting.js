/* Explicit gene-tree outgroup rooting. The species root is always read-only. */
(function(root,factory){
  const api=factory();
  if(typeof module === 'object' && module.exports) module.exports=api;
  else root.PhyloRenderGeneRooting=api;
})(globalThis,function(){
  'use strict';
  function create({identity,input,rooting}){
    const tips=identity.descendantTipNodes;
    const names=root=>identity.tipProfile(root,'exact').names;
    function invalid(message){
      return Object.assign(new Error(message),{code:'PHYPARTS_OUTGROUP_INVALID'});
    }
    function inferredOutgroup(root){
      if((root.children||[]).length!==2)return null;
      const single=root.children.filter(child=>!(child.children||[]).length);
      return single.length===1?String(single[0].label||'').trim():null;
    }
    function selection(species,{rootPolicy='outgroup',outgroups=[]}={}){
      if(!Array.isArray(outgroups)||outgroups.some(name=>typeof name!=='string'||!name.trim()||name!==name.trim())
        ||new Set(outgroups).size!==outgroups.length)throw invalid('Outgroups must be a list of unique, untrimmed raw tip labels');
      if(rootPolicy==='input'){
        if(outgroups.length)throw invalid('Gene-tree outgroups cannot be specified when retaining input roots');
        return [];
      }
      if(rootPolicy!=='outgroup')throw invalid('Unknown gene-tree rooting policy for concordance analysis');
      const selected=outgroups.length?[...outgroups]:[inferredOutgroup(species)].filter(Boolean);
      if(!selected.length)throw invalid('No single-taxon outgroup can be inferred automatically from the species tree; please explicitly select all taxa on one side of the input root');
      const nodes=tips(species).filter(node=>selected.includes(node.label.trim()));
      if(nodes.length!==selected.length||(species.children||[]).length!==2
        ||!rooting.findMatchingRootChild(species,nodes.map(node=>node.id)))
        throw invalid('Selected outgroup taxa must match one complete daughter clade of the bifurcating species-tree root; the species tree is never rerooted');
      return selected;
    }
    function observed(gene,selected){
      const present=new Set(names(gene));
      return selected.filter(name=>present.has(name));
    }
    function separatingEdge(root,outgroups){
      const graph=input.buildGraph(root);
      const ids=tips(root).filter(node=>outgroups.includes(node.label.trim())).map(node=>node.id);
      return {graph,match:rooting.findSeparatingEdge(graph,ids)};
    }
    function eligibility(species,gene,options,comparison){
      if(comparison.speciesDuplicates.length||comparison.geneDuplicates.length)
        return {accepted:false,category:'invalid',reason:'Empty or duplicate tip labels'};
      if(comparison.extra.length)
        return {accepted:false,category:'unknown',reason:`${comparison.extra.length} tip(s) are absent from the species tree; reconcile tip labels first`};
      if(comparison.geneCount<3)return {accepted:false,category:'invalid',reason:'Fewer than 3 tips; rooted bipartitions cannot be compared'};
      const selected=selection(species,options),present=observed(gene,selected);
      if(options.rootPolicy!=='input'){
        if(!present.length)return {accepted:false,category:'unrootable',reason:`Outgroup (${selected.join(', ')}) is absent; gene tree cannot be rooted consistently`};
        try{separatingEdge(gene,present);}catch(error){
          return {accepted:false,category:'unrootable',reason:`Observed outgroup taxa do not form a single monophyletic bipartition in the gene tree: ${error.message}`};
        }
      }else if(gene.rootingDirective==='unrooted'||(gene.children||[]).length!==2)
        return {accepted:false,category:'unrootable',reason:'Tree is marked unrooted or lacks a bifurcating root; cannot be treated as pre-rooted'};
      return {accepted:true,exact:comparison.accepted,outgroup:selected.length===1?selected[0]:null,
        missing:comparison.missing.length,...(selected.length>1?{outgroups:present}:{} )};
    }
    function orient(root,eligibility){
      const outgroups=eligibility.outgroups||(eligibility.outgroup?[eligibility.outgroup]:[]);
      if(!outgroups.length)return root;
      const ids=tips(root).filter(node=>outgroups.includes(node.label.trim())).map(node=>node.id);
      if(root.children.length===2&&rooting.findMatchingRootChild(root,ids))return root;
      const {graph,match}=separatingEdge(root,outgroups);
      return rooting.rerootOnEdge(graph,match.edge.id,match.selectedEndpointId);
    }
    return Object.freeze({inferredOutgroup,selection,eligibility,orient});
  }
  return Object.freeze({create});
});
