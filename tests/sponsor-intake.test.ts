import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSponsoredIntake} from '../relayer/src/independent-writer';

const pending=()=>{let resolve!:()=>void,reject!:(e:unknown)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};

test('both admission observations start together; successful simulation alone cannot admit',async()=>{
 const simulation=pending(),gate=pending(),started:string[]=[];let accepted=false;
 const work=validateSponsoredIntake(()=>{started.push('simulation');return simulation.promise;},()=>{started.push('gate');return gate.promise;})
  .then(()=>{accepted=true;});
 await Promise.resolve();assert.deepEqual(started,['simulation','gate']);
 simulation.resolve();await Promise.resolve();await Promise.resolve();assert.equal(accepted,false);
 gate.resolve();await work;assert.equal(accepted,true);
});

test('closed admission and uncertain RPCs cannot reach intake success in either order',async()=>{
 for(const first of ['simulation','gate'] as const){
  const simulation=pending(),gate=pending();let accepted=false;
  const error=first==='gate'?Object.assign(Error('Closed'),{accepted:false,code:'AGENT_ADMISSIONS_CLOSED'}):Error('429');
  const work=validateSponsoredIntake(()=>simulation.promise,()=>gate.promise).then(()=>{accepted=true;});
  const checked=assert.rejects(work,e=>e===error);
  (first==='gate'?gate:simulation).reject(error);await checked;
  (first==='gate'?simulation:gate).resolve();await Promise.resolve();assert.equal(accepted,false);
 }
});

test('only a decoded execution revert is explicit simulation non-acceptance',async()=>{
 for(const error of [Error('transport unavailable'),Object.assign(Error('wrapped'),{cause:{name:'ContractFunctionRevertedError'}})]){
  await assert.rejects(validateSponsoredIntake(async()=>{throw error;},async()=>{}),(e:any)=>
   'cause' in error?e.accepted===false&&e.code==='CONTRACT_REJECTED':e===error&&e.accepted===undefined);
 }
});

test('legacy intake still awaits its exact simulation without an admission callback',async()=>{
 let called=0;await validateSponsoredIntake(async()=>{called++;});assert.equal(called,1);
});
