import test from 'node:test';
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {independentLegacy} from '../relayer/src/independent-legacy';
import {independentHistory} from '../relayer/src/independent-history';

test('restored arena history merges prior opponents without moving private contacts',async()=>{
 const player='0x'+'a'.repeat(40),rival='0x'+'b'.repeat(40),other='0x'+'c'.repeat(40);
 const historicalCalls:string[]=[];
 const legacy=independentLegacy({query:async(sql:string,args:string[])=>{
  assert.deepEqual(args,[player]);historicalCalls.push(sql);
  if(sql.includes('il_contacts'))return{rows:[{contact:rival}]};
  assert(sql.includes('verified AND phase=3'));
  return{rows:[{a:player,b:rival,at:120},{a:other,b:player,at:90}]};
 }} as unknown as Pool);
 const current={query:async(sql:string)=>{
  assert(!sql.includes('il_contacts')&&!sql.includes('il_results'),'No legacy tables in the restored arena database');
  return{rows:sql.startsWith('SELECT record')?[{record:{latest:{a:player,b:rival},at:150}}]:[]};
 }} as unknown as Pool;
 const history=await independentHistory(current,{} as any,{lobby:player} as any,undefined,legacy);
 try{
  assert.deepEqual(await legacy.contacts(player.toUpperCase()),[rival]);
  assert.deepEqual(await history.frequent(player as any),[{player:rival,count:2,at:150},{player:other,count:1,at:90}]);
  assert.equal(historicalCalls.length,2);
 }finally{history.stop();}
});
