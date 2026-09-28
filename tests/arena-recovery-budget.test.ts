import test from 'node:test';
import assert from 'node:assert/strict';
import {replacementBudget,verifiedRecovery,type ArenaRecoveryWindow} from '../shared/arena-replacement';
test('replacement budget resets only after sustained, publishing recovery',()=>{
 let window:ArenaRecoveryWindow|undefined;
 for(let now=1000;now<=901000;now+=15000){
  const result=verifiedRecovery(window,{epoch:2n,batches:now>900000?20n:10n,healthy:true,now});window=result.window;
  if(now<901000)assert.equal(result.recoveredAt,undefined);
  else{assert.equal(result.recoveredAt,now);assert(replacementBudget([100,200],now,result.recoveredAt).allowed);}
 }
 assert.equal(replacementBudget([100,200],901000).allowed,false);
 assert.throws(()=>replacementBudget([],100,101),/recovery time/);
});
test('gaps, wrong epochs, unhealthy observations and no publication cannot reset a budget',()=>{
 const before={epoch:'2',since:0,lastAt:900000,firstBatches:'10'};
 for(const input of [{epoch:3n,batches:20n,healthy:true,now:915000},{epoch:2n,batches:20n,healthy:true,now:950000},
  {epoch:2n,batches:20n,healthy:false,now:915000},{epoch:2n,batches:10n,healthy:true,now:915000}])
  assert.equal(verifiedRecovery(before,input).recoveredAt,undefined);
});
