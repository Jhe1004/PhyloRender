(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderCloudJitter=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function hash(text) {
    let value=2166136261;
    for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);
    return value>>>0;
  }
  function validateStrength(value,limits) {
    if(!limits || !Number.isInteger(value) || value<limits.minimum || value>limits.maximum)
      throw Object.assign(new Error("Cloud jitter must be an integer from 0 to 100"),{code:"CLOUD_INVALID_JITTER"});
    return value;
  }
  // A visual seed, never a scientific clade identity. Child order and mutable
  // numeric node IDs do not affect it. Input ordinal separates duplicate trees.
  function* branchPathsSteps(root,ages,rows,xOf,config) {
    const {limits,rowStep,minimumY,maximumY,index=0}=config;
    const strength=validateStrength(config.strength,limits),paths=new Map();
    if(!Number.isFinite(rowStep)||rowStep<=0||!Number.isFinite(minimumY)||!Number.isFinite(maximumY)||maximumY<minimumY)
      throw new TypeError("Invalid cloud jitter display bounds");
    if(strength===0)return paths;
    const ageSnapshot=new Map(ages),rowSnapshot=new Map(rows),entries=new Map();
    function* snapshot(node) {
      const children=[...node.children],name=children.length?null:node.label.trim();
      const x=xOf(ageSnapshot.get(node)),y=rowSnapshot.get(node);
      if(!Number.isFinite(x)||!Number.isFinite(y)||y<minimumY||y>maximumY)
        throw Object.assign(new Error("Invalid cloud jitter endpoint"),{code:"CLOUD_INVALID_JITTER_ENDPOINT"});
      entries.set(node,{children,name,x,y,signature:null});
      yield {phase:"cloud-jitter-snapshot"};
      for(const child of children)yield* snapshot(child);
      const signature=children.length
        ? "("+children.map(child=>entries.get(child).signature).sort().join(",")+")"
        : JSON.stringify(name);
      entries.get(node).signature=hash(signature).toString(16);
    }
    yield* snapshot(root);
    const seed="cloud-jitter-v1:"+entries.get(root).signature+":"+index;
    const amplitude=rowStep*limits.maximumAmplitudeRows*strength/limits.maximum;
    // Equal x controls keep x(t) linear: jitter never invents time offsets.
    for(const [node,parent] of entries) {
      for(const child of parent.children) {
        const end=entries.get(child),dx=end.x-parent.x,dy=end.y-parent.y;
        if(dx===0)continue; // Zero-duration edges must stay zero-duration lines.
        const random=hash(seed+":"+parent.signature+":"+end.signature);
        const noise=(random&1?-1:1)*(.2+.8*(random>>>1)/2147483647);
        const firstY=parent.y+dy/3,secondY=parent.y+2*dy/3;
        const wanted=amplitude*noise/.75;
        const offset=Math.max(minimumY-Math.min(firstY,secondY),
          Math.min(maximumY-Math.max(firstY,secondY),wanted));
        if(offset!==0)paths.set(child,`M ${parent.x} ${parent.y} C ${parent.x+dx/3} ${firstY+offset} ${parent.x+2*dx/3} ${secondY+offset} ${end.x} ${end.y}`);
        yield {phase:"cloud-jitter-paths"};
      }
    }
    return paths;
  }
  return Object.freeze({validateStrength,branchPathsSteps});
});
