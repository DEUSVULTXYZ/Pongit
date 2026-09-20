import test from 'node:test';
import assert from 'node:assert/strict';
import {zeroAddress,toHex,createPublicClient,custom,decodeFunctionData,encodeFunctionResult,multicall3Abi,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {familyGrantHash,lobbyCommandContext} from '../shared/independent-command';
import {publicIndependentManifest,type FamilyGrant} from '../shared/independent';
import {abi as familyAbi} from '../shared/abi-independent-ArcadeFamily';
import {independentRules} from '../shared/independent-rules';
const address=(i:number)=>toHex(i,{size:20}) as Address;
const m=publicIndependentManifest({chainId:10143,hub:address(1),family:address(2),lobby:address(3),ratings:address(4),settlement:address(5),vault:address(6),market:address(7),profiles:address(8),privateData:address(9),pressureSigner:address(10),arenas:[11,12,13].map(i=>({app:address(i)})),genesis:1,createdAt:'2026-09-20'});
const grant:FamilyGrant={player:address(20),key:address(21),issuedAt:10n,expires:500n,revision:2n};
function fixture(current=grant,timestamp=450n,error?:Error){
 const methods:string[]=[];
 const base=createPublicClient({chain:monadTestnet,transport:custom({async request({method,params}:any){
  methods.push(method);if(method==='eth_blockNumber')return '0x4d';
  assert.equal(method,'eth_call');assert.equal(params[1],'0x4d');
  if(error)throw error;
  assert.equal(params[0].to.toLowerCase(),monadTestnet.contracts.multicall3.address.toLowerCase());
  const request=decodeFunctionData({abi:multicall3Abi,data:params[0].data});assert.equal(request.functionName,'aggregate3');
  const calls=request.args![0] as readonly {target:Address;callData:`0x${string}`}[];assert.equal(calls.length,3);
  const results=calls.map(call=>{
   let data:`0x${string}`;
   if(call.target.toLowerCase()===m.family.toLowerCase()){
    const q=decodeFunctionData({abi:familyAbi,data:call.callData});assert.equal(q.functionName,'grantOf');assert.equal(q.args![0],grant.player);
    data=encodeFunctionResult({abi:familyAbi,functionName:'grantOf',result:current});
   }else if(call.target.toLowerCase()===m.lobby.toLowerCase()){
    const abi=independentRules(m).lobby,q=decodeFunctionData({abi,data:call.callData});assert.equal(q.functionName,'commandNonces');assert.equal(q.args![0],familyGrantHash(m,grant));
    data=encodeFunctionResult({abi,functionName:'commandNonces',result:19n});
   }else{
    assert.equal(call.target.toLowerCase(),monadTestnet.contracts.multicall3.address.toLowerCase());
    assert.equal(decodeFunctionData({abi:multicall3Abi,data:call.callData}).functionName,'getCurrentBlockTimestamp');
    data=encodeFunctionResult({abi:multicall3Abi,functionName:'getCurrentBlockTimestamp',result:timestamp});
   }
   return {success:true,returnData:data};
  });
  return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:results});
 }},{retryCount:0})});
 return {base,methods};
}
test('authorization, nonce and EVM clock use one pinned multicall and no full block RPC',async()=>{
 const {base,methods}=fixture();const context=await lobbyCommandContext(base,m,grant);
 assert.equal(context.nonce,19n);assert.equal(context.deadline,500n);assert.deepEqual(methods,['eth_blockNumber','eth_call']);
 await lobbyCommandContext(base,m,grant);assert.equal(methods.filter(x=>x==='eth_blockNumber').length,2,'Do not reuse a stale block for a later action');
});
test('revocation, replaced key, identity, revision and expiration prevent a command context',async()=>{
 for(const current of [{...grant,key:zeroAddress},{...grant,key:address(30)},{...grant,player:address(30)},{...grant,revision:3n},{...grant,issuedAt:11n}])
  await assert.rejects(lobbyCommandContext(fixture(current).base,m,grant),/Renew arcade session/);
 await assert.rejects(lobbyCommandContext(fixture(grant,500n).base,m,grant),/Renew arcade session/);
 assert.equal((await lobbyCommandContext(fixture(grant,200n).base,m,grant)).deadline,320n);
});
test('RPC failure propagates without declaring session expiry',async()=>{
 await assert.rejects(lobbyCommandContext(fixture(grant,450n,Error('RPC unavailable')).base,m,grant),/RPC unavailable/);
});
test('the grant digest commits to deployment, identity, timing and revision',()=>{
 const hash=familyGrantHash(m,grant);
 for(const change of [{player:address(30)},{key:address(30)},{issuedAt:11n},{expires:501n},{revision:3n}])assert.notEqual(familyGrantHash(m,{...grant,...change}),hash);
 assert.notEqual(familyGrantHash({...m,family:address(30)},grant),hash);
});
