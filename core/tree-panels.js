(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PhyloRenderTreePanels=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const CONTINUATION_GAP_ROWS=.75;
  function nodeById(root,id) {
    if(!root||!id)return null;
    if(root.id===id)return root;
    for(const child of root.children){const found=nodeById(child,id);if(found)return found;}
    return null;
  }
  function candidates(root,protectedLabels,tipCount) {
    const result=[];let next=0;
    (function visit(node,isRoot=false){
      if(!node.children.length){
        node.panelFirstTipIndex=next;node.panelLastTipIndex=next++;
        node.containsProtectedPanelTip=protectedLabels.has(node.label);return;
      }
      node.children.forEach(child=>visit(child));
      node.panelFirstTipIndex=node.children[0].panelFirstTipIndex;
      node.panelLastTipIndex=node.children.at(-1).panelLastTipIndex;
      node.containsProtectedPanelTip=node.children.some(child=>child.containsProtectedPanelTip);
      if(!isRoot&&!node.containsProtectedPanelTip)result.push({node,count:tipCount(node),lastTipIndex:node.panelLastTipIndex});
    })(root,true);
    return result;
  }
  function select(items,total,maximumTips) {
    const minimumOverviewTips=Math.max(2,Math.min(Math.floor(maximumTips/2),Math.ceil(total*.25)));
    const usable=items.filter(item=>item.count<=total-minimumOverviewTips);
    const eligible=usable.length?usable:items.filter(item=>item.count<total-1);
    const required=Math.max(1,total-maximumTips),sufficient=eligible.filter(item=>item.count-1>=required);
    const pool=sufficient.length?sufficient:eligible;
    return [...pool].sort((left,right)=>right.lastTipIndex-left.lastTipIndex||
      (sufficient.length?left.count-right.count:right.count-left.count))[0]||null;
  }
  function maximumPath(node) {
    return node.children.length?Math.max(...node.children.map(child=>(Number(child.length)||0)+maximumPath(child))):0;
  }
  function replace(root,targetId,count,timeTree) {
    for(let index=0;index<root.children.length;index++){
      const child=root.children[index];
      if(child.id===targetId){
        root.children[index]={...child,children:[],length:timeTree?(Number(child.length)||0)+maximumPath(child):child.length,
          label:`↪ Continued clade (${count} tips) — see Panel 2`,nodeData:null,panelContinuation:2,
          panelGapBeforeRows:CONTINUATION_GAP_ROWS};
        return true;
      }
      if(replace(child,targetId,count,timeTree))return true;
    }
    return false;
  }
  function lock(node){node.printOrderLocked=true;node.children.forEach(lock);return node;}
  function gapRows(node){
    if(!node)return 0;
    if(!node.children.length)return Math.max(0,Number(node.panelGapBeforeRows)||0);
    return node.children.reduce((sum,child)=>sum+gapRows(child),0);
  }
  function plan(root,ports) {
    const {clone,tipCount,descendantTipLabels,ladderize,direction="small-top",maximumTips=76,timeTree=false}=ports;
    const overview=clone(root);ladderize(overview,direction);
    const plans=[{root:overview,panelNumber:1,sourceNodeId:null,originalTipCount:tipCount(root)}];
    if(tipCount(overview)<=maximumTips)return plans.map(item=>({...item,root:lock(item.root)}));
    const outgroup=nodeById(overview,overview.outgroupChildId);
    const selected=select(candidates(overview,new Set(outgroup?descendantTipLabels(outgroup):[]),tipCount),tipCount(overview),maximumTips);
    if(!selected)return plans.map(item=>({...item,root:lock(item.root)}));
    const extracted=clone(selected.node);
    extracted.panelIncomingFrom=1;
    plans.push({root:extracted,panelNumber:2,sourceNodeId:selected.node.id,originalTipCount:selected.count});
    replace(overview,selected.node.id,selected.count,timeTree);
    return plans.map(item=>({...item,root:lock(item.root)}));
  }
  return Object.freeze({plan,gapRows});
});
