import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicClient,custom} from 'viem';
import {monadTestnet} from 'viem/chains';
import {prepareSponsoredTransaction} from '../relayer/src/sponsor-prepare';
const owner='0x0000000000000000000000000000000000000001',tx={to:owner,data:'0x1234',value:0n} as const;
function fixture(overrides:Record<string,(p:any)=>any>={}){
 const requests:string[]=[];
 const values:Record<string,any>={eth_getTransactionCount:'0x11',eth_estimateGas:'0x186a0',eth_maxPriorityFeePerGas:'0x2',eth_gasPrice:'0x12',eth_getBlockByNumber:{number:'0x1',timestamp:'0x1',gasLimit:'0x1c9c380',gasUsed:'0x0',baseFeePerGas:'0xf',transactions:[]}};
 const client=createPublicClient({chain:monadTestnet,transport:custom({async request({method,params}:any){requests.push(method);if(overrides[method])return overrides[method](params);assert(method in values,'Unexpected RPC '+method);return values[method];}},{retryCount:0})});
 return {client,requests,values};
}
test('real viem preparation shares one fresh block for gas and fees, preserving explicit nonce and chain',async()=>{
 const {client,requests}=fixture();
 const expected={...tx,chainId:10143,nonce:17,gas:120_000n,type:'eip1559',maxFeePerGas:20n,maxPriorityFeePerGas:2n};
 assert.deepEqual(await prepareSponsoredTransaction(client,owner,tx),expected);
 assert.equal(requests.filter(x=>x==='eth_getBlockByNumber').length,1);
 assert.equal(requests.filter(x=>x==='eth_getTransactionCount').length,2);
 await prepareSponsoredTransaction(client,owner,tx);
 assert.equal(requests.filter(x=>x==='eth_getBlockByNumber').length,2,'A later transaction must observe a fresh block');
});
test('nonce, block and simulation RPCs start concurrently; no sequential preparation window',async()=>{
 let started=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const f=fixture();
 const overrides=Object.fromEntries(['eth_getTransactionCount','eth_getBlockByNumber','eth_estimateGas'].map(method=>[method,async()=>{if(++started===4)release();await gate;return f.values[method];}]));
 await prepareSponsoredTransaction(fixture(overrides).client,owner,tx);
 assert.equal(started,4);
});
test('fee fallback keeps viem semantics and does not fetch a second block',async()=>{
 const f=fixture({eth_maxPriorityFeePerGas:()=>{throw Error('Method unavailable');}});
 const request=await prepareSponsoredTransaction(f.client,owner,tx);
 assert.equal(request.maxPriorityFeePerGas,3n);assert.equal(request.maxFeePerGas,21n);
 assert.equal(f.requests.filter(x=>x==='eth_getBlockByNumber').length,1);
});
test('unknown nonce, excess gas, missing base fee and RPC failure prevent preparation',async()=>{
 await assert.rejects(prepareSponsoredTransaction(fixture({eth_getTransactionCount:([,tag])=>tag==='pending'?'0x12':'0x11'}).client,owner,tx),/reconciliation/);
 for(const limit of [30_000_000n,10_000n]){
  const f=fixture({eth_estimateGas:()=> '0x18cba80'});f.values.eth_getBlockByNumber.gasLimit='0x'+limit.toString(16);
  await assert.rejects(prepareSponsoredTransaction(f.client,owner,tx),/gas estimate exceeds/);
 }
 const f=fixture();f.values.eth_getBlockByNumber.baseFeePerGas=null;
 await assert.rejects(prepareSponsoredTransaction(f.client,owner,tx),/EIP-1559/);
 await assert.rejects(prepareSponsoredTransaction(fixture({eth_estimateGas:()=>{throw Error('RPC offline');}}).client,owner,tx),/RPC offline/);
});
