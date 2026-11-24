import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,access,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {FigureStore} from '../src/store.mjs';

const svg=(text,build='original',science='original')=>`<svg xmlns="http://www.w3.org/2000/svg"><metadata id="phylorender-build">${build}</metadata><metadata id="science">${science}</metadata><text x="1">${text}</text></svg>`;
async function fixture(run){
  const directory=await mkdtemp(path.join(os.tmpdir(),'phylorender-artifact-integrity-'));
  let source=svg('A'),png='fixture PNG';
  const renderer={async render(spec,{formats=[]}={}){return {svg:source,normalizedSpec:spec,report:{},...(formats.includes('png')?{png:Buffer.from(png)}:{}),...(formats.includes('preview')?{preview:Buffer.from('fixture preview')}:{})};}};
  try {
    const store=await new FigureStore(renderer,directory).initialize();
    const figure=await store.create({main_tree:{content:'(A:1,B:1);'}});
    await run({store,figure,directory,setSource(value){source=value;},setPng(value){png=value;}});
  }finally{await rm(directory,{recursive:true,force:true});}
}

test('new rasters cannot silently differ from the immutable revision SVG',async()=>fixture(async({store,figure,setSource})=>{
  const original=await store.artifact(figure.figureId,'figure.svg',1);
  setSource(svg('B'));
  await assert.rejects(store.ensureArtifacts(figure.figureId,1,['png','preview']),{code:'ARTIFACT_RENDER_MISMATCH'});
  await assert.rejects(access(path.join(figure.directory,'figure.png')));
  await assert.rejects(access(path.join(figure.directory,'preview.png')));
  assert.deepEqual((await store.artifact(figure.figureId,'figure.svg',1)).data,original.data);
  assert.equal((await store.listRevisions(figure.figureId)).current_revision,1);
}));

test('build metadata alone may change while regenerated artifacts remain equivalent',async()=>fixture(async({store,figure,setSource})=>{
  setSource(svg('A','new build'));
  await store.ensureArtifacts(figure.figureId,1,['png']);
  assert.equal((await readFile(path.join(figure.directory,'figure.png'))).toString(),'fixture PNG');
  assert.match((await readFile(path.join(figure.directory,'figure.svg'))).toString(),/>original<\/metadata>/);
}));

test('scientific metadata is not discarded by the reproducibility comparison',async()=>fixture(async({store,figure,setSource})=>{
  setSource(svg('A','original','changed denominator'));
  await assert.rejects(store.ensureArtifacts(figure.figureId,1,['png']),{code:'ARTIFACT_RENDER_MISMATCH'});
}));

test('adding a preview cannot overwrite an existing PNG after a raster-policy change',async()=>fixture(async({store,figure,setPng})=>{
  await store.ensureArtifacts(figure.figureId,1,['png']);
  const original=await store.artifact(figure.figureId,'figure.png',1);
  setPng('different software-canvas PNG');
  await assert.rejects(store.ensureArtifacts(figure.figureId,1,['png','preview']),{code:'ARTIFACT_RENDER_MISMATCH'});
  assert.deepEqual((await store.artifact(figure.figureId,'figure.png',1)).data,original.data);
  await assert.rejects(access(path.join(figure.directory,'preview.png')));
  assert.equal((await store.listRevisions(figure.figureId)).current_revision,1);
}));
