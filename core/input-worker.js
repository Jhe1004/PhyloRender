/* Worker owns expensive input preparation; termination is its hard cancel. */
importScripts('tree-input.js','tree-order.js','sample-identity.js','support-scale.js','../tree-rooting.js','gene-rooting.js','../cloud-tree.js','gene-preparation.js','phyparts-engine.js');
self.onmessage=({data:{id,operation,payload}})=>{
  try{
    const progress=value=>self.postMessage({id,progress:value});
    const result=operation==='parse'
      ? PhyloRenderGenePreparation.assertRenderable(PhyloRenderInput.parseNewick(payload.text,payload.options))
      : operation==='genes'?PhyloRenderGenePreparation.prepare(payload,progress)
      : operation==='payload'?PhyloRenderGenePreparation.payload(payload.speciesRoot,payload.genes,payload.names,payload.options)
      : operation==='phyparts'?PhyloRenderPhyParts.analyze(payload,{onProgress:progress})
      : (()=>{throw new Error('Unknown input operation');})();
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:{message:error.message,code:error.code||'TREE_INPUT_INVALID',issues:error.issues}});}
};
