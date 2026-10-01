import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicClient,custom,decodeFunctionData,encodeFunctionResult,multicall3Abi,parseAbi,type Hex} from 'viem';
import {monadTestnet} from 'viem/chains';
import {canonicalContractReads} from '../shared/canonical-contract-reads';

const abi=parseAbi(['function value(uint256 id) view returns(uint256)']);
const address='0x0000000000000000000000000000000000000001';
const hash=`0x${'ab'.repeat(32)}` as Hex;
function fixture(){
 const requests:any[]=[];let reject=false,failedCall=false;
 const client=createPublicClient({chain:monadTestnet,transport:custom({request:async request=>{
  requests.push(request);assert.equal(request.method,'eth_call');
  const [call,at]=request.params as any;assert.deepEqual(at,{blockHash:hash,requireCanonical:true});
  if(reject)throw{code:-32000,message:'block is no longer canonical'};
  const batch=decodeFunctionData({abi:multicall3Abi,data:call.data});assert.equal(batch.functionName,'aggregate3');
  if(batch.functionName!=='aggregate3')throw Error();
  return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:batch.args[0].map(c=>{
   // viem permits each EVM subcall, then enforces allowFailure:false while decoding.
   const input=decodeFunctionData({abi,data:c.callData});
   if(failedCall&&input.args[0]===2n)return{success:false,returnData:'0x'};
   return{success:true,returnData:encodeFunctionResult({abi,functionName:'value',result:input.args[0]+10n})};
  })});
 }},{retryCount:0})});
 return{client,requests,reorg:()=>{reject=true;},failOne:()=>{failedCall=true;}};
}
test('canonical snapshot uses one real encoded multicall for concurrent reads and pins dependent reads to the same hash',async()=>{
 const f=fixture(),r=canonicalContractReads(f.client,hash);
 assert.deepEqual(await Promise.all([r.read(address,abi,'value',[1n]),r.read(address,abi,'value',[2n])]),[11n,12n]);
 assert.equal(f.requests.length,1);
 assert.equal(await r.read(address,abi,'value',[11n]),21n);assert.equal(f.requests.length,2);
 f.reorg();await assert.rejects(r.read(address,abi,'value',[1n]),/no longer canonical/);
 assert.equal(f.requests.length,3,'No latest-block fallback or cached earlier success');
});
test('large catalogue is bounded into batches without dropping or reordering identities',async()=>{
 const f=fixture(),r=canonicalContractReads(f.client,hash);
 assert.deepEqual(await Promise.all(Array.from({length:65},(_,i)=>r.read(address,abi,'value',[BigInt(i)]))),
  Array.from({length:65},(_,i)=>BigInt(i)+10n));
 assert.equal(f.requests.length,3);
});
test('one failed contract read rejects its snapshot group instead of returning partial authority data',async()=>{
 const f=fixture(),r=canonicalContractReads(f.client,hash);f.failOne();
 const results=await Promise.allSettled([r.read(address,abi,'value',[1n]),r.read(address,abi,'value',[2n])]);
 assert(results.every(result=>result.status==='rejected'));assert.equal(f.requests.length,1);
});
