const test = require('node:test');
const assert = require('node:assert/strict');
const identity = require('../core/sample-identity.js');
const operations = require('../core/sample-name-state.js');
const workbench = require('../ui/sample-names.js');

function model() {
  const stores = [{overrides:new Map(),pending:null}, {overrides:new Map(),pending:null}];
  let current = 0, invalidations = 0, allInvalidations = 0;
  const names = operations.create({identity, readOriginals:()=>['A_alpha','B_beta'],readOverrides:()=>stores[current].overrides,
    replaceOverrides:value=>{stores[current].overrides=value;},invalidateRecognition:()=>{invalidations++;},
    readPending:()=>stores[current].pending,writePending:value=>{stores[current].pending=value;},
    invalidateAllRecognition:()=>{allInvalidations++;}});
  return {names,stores,switchTo:index=>{current=index;},invalidations:()=>invalidations,allInvalidations:()=>allInvalidations};
}
class Element {
  constructor(){this.children=[];this.value='';this.checked=false;this.disabled=false;this.dataset={};this.listeners=new Map();this.attrs={};
    const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)};
    this.style={setProperty:(key,value)=>{this.attrs[key]=value;}};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  addEventListener(type,callback){const list=this.listeners.get(type)||[];list.push(callback);this.listeners.set(type,list);}
  removeEventListener(type,callback){this.listeners.set(type,(this.listeners.get(type)||[]).filter(item=>item!==callback));}
  async fire(type,event={}){for(const handler of this.listeners.get(type)||[])await handler({target:this,preventDefault(){},stopPropagation(){},...event});}
  showModal(){this.open=true;} close(){this.open=false;} focus(){this.focused=true;} select(){this.selected=true;}
  getAttribute(key){return this.attrs[key];}
}
function ui(extra={}) {
  const data=model(),elements={};
  for(const name of ['select','list','status','clear','edit','mappingFile','template','original','input','restore','dialog','form','cancel','svg',
    'family','color','size','bold','italic','normalize','follow','rankStatus','taxonStatus'])elements[name]=new Element();
  elements.family.value='Arial';elements.color.value='#17211b';elements.size.value='24';elements.italic.value='auto';elements.normalize.checked=true;
  const calls=[];
  const ports={elements,names:data.names,baseLabel:identity.baseTipDisplayLabel,displayLabel:raw=>data.names.snapshot().overrides.get(raw)||identity.baseTipDisplayLabel(raw),
    createElement:()=>new Element(),renderTree:()=>calls.push('render'),recognize:options=>calls.push(['recognize',options]),
    requestSettingsRender:()=>calls.push('settings'),showMessage:(...args)=>calls.push(['message',...args]),
    parseMappingFile:async()=>({'A_alpha':'Alpha renamed'}),downloadTemplate:()=>calls.push('download'),
    deferFocus:callback=>callback(),canRenameFromFigure:()=>true,syncTipSize:size=>{elements.size.value=String(size);calls.push(['size',size]);},...extra};
  return {...data,elements,calls,ports,api:workbench.create(ports)};
}

test('factories fail on missing ports and expose isolated frozen interfaces',()=>{
  assert.throws(()=>operations.create(),/Missing/);assert.throws(()=>workbench.create(),/Missing/);
  const a=model(),b=model();assert.notEqual(a.names,b.names);assert.equal(Object.isFrozen(a.names),true);assert.equal(Object.isFrozen(ui().api),true);
});
test('name batches validate before commit and preserve raw identities',()=>{
  const data=model();data.names.apply({'A alpha':'Alpha display'});
  const before=data.names.serialized();assert.throws(()=>data.names.apply({'B_beta':'Beta display','missing':'Oops'}),/absent|not found|not in/i);
  assert.deepEqual(data.names.serialized(),before);assert.equal(data.invalidations(),1);
  assert.equal(data.names.resolve('Alpha display'),null);assert.equal(data.names.resolve('A alpha'),'A_alpha');
  assert.deepEqual(data.names.snapshot().originals,['A_alpha','B_beta']);
});
test('merge replace clear and remove retain historical mutation and return semantics',()=>{
  const data=model(),first=data.stores[0].overrides;
  assert.deepEqual(data.names.apply({'B beta':'B display','A_alpha':'A display'}),{changedCount:2,overrides:{A_alpha:'A display',B_beta:'B display'}});
  assert.notEqual(data.stores[0].overrides,first);const second=data.stores[0].overrides;
  assert.equal(data.names.remove('B beta'),true);assert.equal(data.stores[0].overrides,second);
  assert.equal(data.names.remove('missing'),false);data.names.apply({A_alpha:'A alpha'});assert.deepEqual(data.names.serialized(),{});
  data.names.apply({B_beta:'B display'},'replace');assert.equal(data.names.clear(),1);assert.equal(data.names.clear(),0);
});
test('operations resolve the current document on every call and snapshots cannot mutate it',()=>{
  const data=model();data.names.apply({A_alpha:'First'});data.names.setPending('A_alpha');const snapshot=data.names.snapshot();snapshot.overrides.clear();
  assert.equal(data.names.serialized().A_alpha,'First');data.switchTo(1);assert.deepEqual(data.names.serialized(),{});assert.equal(data.names.pending(),null);
  data.names.apply({B_beta:'Second'});data.names.invalidateRanks();data.switchTo(0);assert.equal(data.names.pending(),'A_alpha');
  assert.deepEqual(data.names.serialized(),{A_alpha:'First'});assert.equal(data.allInvalidations(),1);
});
test('mapping controls preserve selection, safe text content and canonical original keys',()=>{
  const data=ui();data.elements.select.value='B_beta';data.api.applyOverrides({A_alpha:'<script>display</script>'},{render:false,message:false});
  assert.equal(data.elements.select.value,'B_beta');assert.equal(data.elements.list.children[0].dataset.originalTipLabel,'A_alpha');
  assert.equal(data.elements.list.children[0].children[0].children[1].textContent,'<script>display</script>');
  assert.equal(data.elements.status.textContent,'Overridden 1 / 2 tip label(s)');assert.deepEqual(data.calls,[]);
});
test('GUI and semantic delegates use the same operations and ordered render recognition feedback',()=>{
  const data=ui();data.api.applyOverrides({'A alpha':'Shown'});
  assert.equal(data.calls[0],'render');assert.deepEqual(data.calls[1],['recognize',{force:true}]);assert.equal(data.calls[2][0],'message');
  data.calls.length=0;assert.equal(data.api.removeOverride('A_alpha',{render:false}),true);assert.deepEqual(data.calls,[]);
  data.api.clearOverrides({render:false,message:false});assert.deepEqual(data.calls,[]);
});
test('presentation snapshots and rank/name statuses use only supplied controls and metadata',()=>{
  const data=ui();const p=data.api.capturePresentation();data.elements.family.value='Arimo';data.api.restorePresentation(p);
  assert.equal(data.elements.family.value,'Arial');assert.deepEqual(data.calls,[['size',24]]);
  const group={children:[{getAttribute:()=>2}]};data.api.updateRankStatus(group);assert.match(data.elements.rankStatus.textContent,/2 rank token/);
  data.api.updateTaxonStatus('Ready','ready');assert.equal(data.elements.taxonStatus.classList.contains('ready'),true);
  assert.match(data.api.engineMessage(2,{engine:'gnfinder+gnparser',versions:{gnfinder:'1',gnparser:'2'},recognized:2,parsed:1}),/2\/2/);
});
test('dialog pending state is explicit and restoration keeps originals intact',async()=>{
  const data=ui();data.api.bind();data.api.openRename('A alpha');assert.equal(data.names.pending(),'A_alpha');assert.equal(data.elements.dialog.open,true);
  assert.equal(data.elements.input.focused,true);data.elements.input.value='Displayed';await data.elements.form.fire('submit');
  assert.equal(data.names.pending(),null);assert.equal(data.elements.dialog.open,false);assert.deepEqual(data.names.serialized(),{A_alpha:'Displayed'});
  data.api.openRename('A_alpha');await data.elements.restore.fire('click');assert.deepEqual(data.names.serialized(),{});
});
test('file errors preserve valid mappings and always reset file input',async()=>{
  const data=ui({parseMappingFile:async()=>{throw Error('Invalid mapping');}});data.api.applyOverrides({A_alpha:'Before'},{render:false,message:false});data.api.bind();
  data.elements.mappingFile.files=[{name:'bad.csv'}];data.elements.mappingFile.value='bad.csv';await data.elements.mappingFile.fire('change');
  assert.deepEqual(data.names.serialized(),{A_alpha:'Before'});assert.equal(data.elements.mappingFile.value,'');assert.deepEqual(data.calls.at(-1),['message','Label mapping table not applied: Invalid mapping',true]);
});
test('binding is instance-owned, idempotent and disposable without affecting another workbench',async()=>{
  const a=ui(),b=ui();a.api.bind();a.api.bind();b.api.bind();await a.elements.family.fire('change');assert.deepEqual(a.calls,['settings']);assert.deepEqual(b.calls,[]);
  a.api.dispose();await a.elements.family.fire('change');assert.deepEqual(a.calls,['settings']);await b.elements.family.fire('change');assert.deepEqual(b.calls,['settings']);
});
test('italic rank and color events retain original redraw and recognition boundaries',async()=>{
  const data=ui();data.api.bind();data.elements.italic.value='all';await data.elements.italic.fire('change');assert.deepEqual(data.calls,['settings']);
  data.calls.length=0;data.elements.italic.value='auto';await data.elements.italic.fire('change');assert.deepEqual(data.calls,['settings',['recognize',undefined]]);
  data.calls.length=0;await data.elements.normalize.fire('change');assert.equal(data.allInvalidations(),1);assert.deepEqual(data.calls,['settings',['recognize',undefined]]);
  data.calls.length=0;data.elements.color.value='#0072b2';await data.elements.color.fire('input');assert.equal(data.elements.svg.attrs['--tip-color'],'#0072b2');assert.deepEqual(data.calls,[]);
});
