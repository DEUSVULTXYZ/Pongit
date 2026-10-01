import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionResult,keccak256,zeroAddress,zeroHash,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {canonicalHostedConsent} from '../shared/hosted-provisioner';
import {roomsLifecycleHubAbi as abi} from '../shared/abi-rooms-lifecycle';
import {NO_LEASE_HUB} from '../shared/hub-lease';
const signer=privateKeyToAccount(('0x'+'11'.repeat(32)) as Hex),app='0x00000000000000000000000000000000000000aa';
function fixture(){
 const fields=abi.find(x=>x.name==='delegationOf')!.outputs[0].components;
 const d:any=Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:['uint8','uint16','uint32'].includes(f.type)?0:0n]));
 Object.assign(d,{status:1,epoch:2n,baseBlock:20n});
 let owner=signer.address,code:Hex='0x6000',signed=0,chain=10143,reorg=false;
 const base:any={getChainId:async()=>chain,getBlock:async()=>({hash:zeroHash}),getCode:async()=>code,request:async(r:any)=>{
  assert.deepEqual(r.params[1],{blockHash:zeroHash,requireCanonical:true});if(reorg)throw Error('Canonical block changed');
  return r.params[0].to===app?'0x'+owner.slice(2).padStart(64,'0'):encodeFunctionResult({abi,functionName:'delegationOf',result:d});
 }};
 const account={address:signer.address,signMessage:async(args:any)=>{signed++;return signer.signMessage(args);}};
 return{base,account,d,scope:{app,hub:NO_LEASE_HUB,epoch:2n,owner:signer.address,runtimeHash:keccak256(code)} as const,signed:()=>signed,
  mutate:(patch:{owner?:typeof owner;code?:Hex;chain?:number;reorg?:boolean})=>{owner=patch.owner??owner;code=patch.code??code;chain=patch.chain??chain;reorg=patch.reorg??reorg;}};
}
test('the provisioner signs only its exact canonical active arena',async()=>{
 const f=fixture();await canonicalHostedConsent(f.base,f.scope,f.account,'https://control.interludelayer.xyz',fetch);assert.equal(f.signed(),1);
});
test('changed epoch, code, owner, chain, canonical block and closing status cannot obtain consent',async()=>{
 for(const kind of ['epoch','code','owner','chain','reorg','closing','base']){
  const f=fixture();if(kind==='epoch')f.d.epoch=3n;if(kind==='closing')f.d.status=2;if(kind==='base')f.d.baseBlock=0n;
  if(kind==='code')f.mutate({code:'0x6001'});if(kind==='owner')f.mutate({owner:zeroAddress});if(kind==='chain')f.mutate({chain:4242});if(kind==='reorg')f.mutate({reorg:true});
  await assert.rejects(canonicalHostedConsent(f.base,f.scope,f.account,'https://control.interludelayer.xyz',fetch));assert.equal(f.signed(),0,kind);
 }
});
