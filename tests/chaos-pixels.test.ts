import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chaosEvents} from '../shared/chaos-events';
import {chaosIconPixels,chaosIconSvg} from '../shared/chaos-pixels';
test('24 distinct transparent pixel icons fit the same grid and palette',()=>{
 const images=new Set<string>();
 for(const event of chaosEvents){
  const rows=chaosIconPixels(event.id);assert.equal(rows.length,24);
  for(const row of rows)assert.match(row,/^[0-4]{24}$/);
  const ink=rows.join('').replaceAll('0','').length;assert(ink>20&&ink<350);
  const svg=chaosIconSvg(event.id);assert(!svg.includes('script'));assert(!svg.includes('href='));
  assert(!svg.includes('<text'));images.add(svg);
 }
 assert.equal(images.size,24);
});
