import test from 'node:test';
import assert from 'node:assert/strict';
import {observeSponsoredOperation} from '../shared/sponsored-observation';
import type {ChainOperation} from '../shared/independent';

test('late confirmation after the foreground timeout clears only the original operation',async()=>{
 let saved:string|null='profile',reads=0;
 const port={saved:()=>saved,clear:()=>{saved=null;},read:async(id:string):Promise<ChainOperation>=>({id,status:++reads<4?'pending':'confirmed'})};
 for(let i=0;i<3;i++){assert.equal((await observeSponsoredOperation(port))?.status,'pending');assert.equal(saved,'profile');}
 assert.equal((await observeSponsoredOperation(port))?.status,'confirmed');assert.equal(saved,null);
 assert.equal(await observeSponsoredOperation(port),null);assert.equal(reads,4);
});
test('missing responses and a mismatched receipt retain the signed operation',async()=>{
 let cleared=false;const port={saved:()=> 'profile',clear:()=>{cleared=true;},read:async():Promise<ChainOperation>=>{throw Error('offline');}};
 await assert.rejects(observeSponsoredOperation(port),/offline/);assert.equal(cleared,false);
 await assert.rejects(observeSponsoredOperation({...port,read:async()=>({id:'another',status:'confirmed'})}),/identity/);assert.equal(cleared,false);
});
test('old confirmation cannot clear a newer intent; failed operations are terminal',async()=>{
 let saved:string|null='old';
 const op=await observeSponsoredOperation({saved:()=>saved,clear:()=>{saved=null;},read:async id=>{saved='new';return {id,status:'confirmed'};}});
 assert.equal(op?.id,'old');assert.equal(saved,'new');
 assert.equal((await observeSponsoredOperation({saved:()=>saved,clear:()=>{saved=null;},read:async id=>({id,status:'failed',error:'Reverted'})}))?.status,'failed');
 assert.equal(saved,null);
});
