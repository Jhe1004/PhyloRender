const test = require('node:test');
const assert = require('node:assert/strict');
test('ML crown age is explicit for both full clouds and species-only figures; dated inputs need no new age', async () => {
  const { figureSpecSchema } = await import('../mcp-server/src/schemas.mjs');
  const base={workspace:'cloud',main_tree:{content:'(O:3,(A:1,B:1):2);'}};
  for(const show_gene of [true,false]) {
    for(const root_age of [undefined,0,-1]) assert.equal(figureSpecSchema.safeParse({...base,options:{cloud:{show_gene,root_age}}}).success,false);
    assert.equal(figureSpecSchema.safeParse({...base,options:{cloud:{show_gene,root_age:70,root_age_unit:'mya'}}}).success,true);
  }
  for(const species_method of ['dated','coalescent','other'])
    assert.equal(figureSpecSchema.safeParse({...base,options:{cloud:{species_method,show_gene:false}}}).success,true);
});
