(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderCloudGroupColors=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  // Display-only membership: a gene clade inherits the effective color of its
  // species MRCA. An uncolored MRCA remains neutral, even if its tips happen
  // to have identical RGB values in separate user groups.
  function* referenceSteps(root, effectiveColors) {
    const colors=new Map(effectiveColors), byName=new Map(), entries=new Map();
    function* visit(node,parent=null) {
      const depth=parent?entries.get(parent).depth+1:0;
      const up=[parent];
      for(let k=1;up[k-1];k++)up[k]=entries.get(up[k-1]).up[k-1]||null;
      entries.set(node,Object.freeze({depth,up:Object.freeze(up),color:colors.get(node)||null}));
      if(!node.children.length) {
        const name=node.label.trim();
        if(byName.has(name))throw Object.assign(new Error("Duplicate species sample in color reference"),{code:"CLOUD_GROUP_DUPLICATE_SAMPLE"});
        byName.set(name,node);
      }
      yield {phase:"group-color-reference"};
      for(const child of node.children)yield* visit(child,node);
    }
    yield* visit(root);
    return Object.freeze({byName,entries});
  }
  function commonAncestor(a,b,entries) {
    if(entries.get(a).depth<entries.get(b).depth)[a,b]=[b,a];
    let delta=entries.get(a).depth-entries.get(b).depth,k=0;
    while(delta){if(delta%2)a=entries.get(a).up[k];delta=Math.floor(delta/2);k++;}
    if(a===b)return a;
    for(let i=Math.max(entries.get(a).up.length,entries.get(b).up.length)-1;i>=0;i--) {
      const x=entries.get(a).up[i],y=entries.get(b).up[i];
      if(x&&y&&x!==y){a=x;b=y;}
    }
    return entries.get(a).up[0];
  }
  function* branchColorsSteps(root,reference) {
    const result=new Map(),{byName,entries}=reference;
    function* visit(node) {
      let ancestor;
      if(!node.children.length) {
        ancestor=byName.get(node.label.trim());
        if(!ancestor)throw Object.assign(new Error("Gene sample is absent from species color reference"),{code:"CLOUD_GROUP_UNKNOWN_SAMPLE"});
      } else {
        for(const child of node.children) {
          const next=yield* visit(child);
          ancestor=ancestor?commonAncestor(ancestor,next,entries):next;
        }
      }
      const color=entries.get(ancestor).color;
      if(color)result.set(node,color);
      yield {phase:"group-color-membership"};
      return ancestor;
    }
    yield* visit(root);
    return result;
  }
  return Object.freeze({referenceSteps,branchColorsSteps});
});
