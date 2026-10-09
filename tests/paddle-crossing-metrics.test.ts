import test from 'node:test';
import assert from 'node:assert/strict';
import {paddleCrossings} from '../scripts/paddle-crossing-metrics';
const pose=(at:number,x:number,y:number,id=1)=>({at,ref:'app:1:1',rally:'2',sourceUs:'0',renderedUs:'100000',paddles:[288,288],balls:[{id,x,y}]});
const geometry=[0,16].flatMap(at=>[0,1].map(side=>({at,side,height:96})));
test('missed visual contacts fail for each ball on either side, without a velocity reversal',()=>{
 for(const id of [1,2])for(const side of [0,1]){
  const mirror=(x:number)=>side?1024-x:x;
  const result=paddleCrossings([pose(0,mirror(44),290,id),pose(16,mirror(36),294,id)],geometry);
  assert.equal(result.throughPaddle.length,1);assert.equal(result.throughPaddle[0].ball,id);assert.equal(result.throughPaddle[0].side,side);
 }
});
test('actual misses, split gaps and new rallies cannot be classified as paddle crossings',()=>{
 assert.equal(paddleCrossings([pose(0,44,400),pose(16,36,404)],geometry).throughPaddle.length,0);
 assert.equal(paddleCrossings([pose(0,44,288),{...pose(16,36,288),rally:'3'}],geometry).crossings.length,0);
 const snapshots=[{state:{t:'0'},chaos:{physics:{effects:[{id:11,target:0,startsAt:0,expiresAt:1000}]}}}];
 assert.equal(paddleCrossings([pose(0,44,288,2),pose(16,36,288,2)],geometry,snapshots).throughPaddle.length,0);
 assert.equal(paddleCrossings([pose(0,44,310,2),pose(16,36,310,2)],geometry,snapshots).throughPaddle.length,1);
});
