import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicChainRead,publicChainReads} from '../relayer/src/public-chain-read';
import {startPoolReadService} from '../relayer/src/agents/pool-server';
import type {AgentPoolReader} from '../relayer/src/agents/pool-read';
import {createPublicClient,http} from 'viem';

const address=`0x${'11'.repeat(20)}`,hash=`0x${'22'.repeat(32)}`;
const call=(id:number,tag:any='latest')=>({jsonrpc:'2.0',id,method:'eth_call',params:[{to:address,data:'0x12345678'},tag]});
test('public chain reads preserve exact canonical pins and cap execution without permitting writes',()=>{
 const input=call(1,{blockHash:hash,requireCanonical:true});
 const parsed=validatePublicChainRead(input);
 assert.deepEqual(parsed.params[1],input.params[1]);assert.equal(parsed.params[0].gas,'0x1c9c380');
 for(const method of ['eth_sendRawTransaction','interlude_sendTransaction','eth_estimateGas','eth_getLogs','debug_traceCall'])
  assert.throws(()=>validatePublicChainRead({...input,method}));
 for(const extra of [{value:'0x1'},{gas:'0x1c9c381'},{data:'0x'+'00'.repeat(17000)},{authorizationList:[]},{nonce:'0x1'}])
  assert.throws(()=>validatePublicChainRead({...input,params:[{...input.params[0],...extra},'latest']}));
 assert.throws(()=>validatePublicChainRead({...input,params:[input.params[0],'latest',{}]}),'state overrides prohibited');
 assert.throws(()=>validatePublicChainRead([input]));
 assert.throws(()=>validatePublicChainRead(call(1,{blockHash:hash,requireCanonical:false})));
 assert.deepEqual(validatePublicChainRead({jsonrpc:'2.0',id:1,method:'eth_chainId'}).params,[]);
 assert.deepEqual(validatePublicChainRead({jsonrpc:'2.0',id:1,method:'eth_blockNumber'}).params,[]);
 for(const params of [null,{},''])assert.throws(()=>validatePublicChainRead({jsonrpc:'2.0',id:1,method:'eth_chainId',params}));
 assert.throws(()=>validatePublicChainRead({jsonrpc:'2.0',id:1,method:'eth_call'}));
});
test('simultaneous browsers coalesce exact reads but never reuse a stale authorization response',async()=>{
 let requests=0;const releases:((value:unknown)=>void)[]=[];
 const read=publicChainReads({request:async()=>{requests++;return new Promise(resolve=>releases.push(resolve));}} as any);
 const a=read(validatePublicChainRead(call(1))),b=read(validatePublicChainRead(call(2))),c=read(validatePublicChainRead(call(3,'0x10')));
 assert.equal(requests,2);releases[0]('0x01');releases[1]('0x02');
 assert.deepEqual((await Promise.all([a,b,c])).map(x=>[x.id,'result' in x?x.result:null]),[[1,'0x01'],[2,'0x01'],[3,'0x02']]);
 const fresh=read(validatePublicChainRead(call(4)));assert.equal(requests,3);releases[2]('0x03');await fresh;
});
test('public proxy limits outstanding upstream work and redacts unavailable transport details',async()=>{
 const releases:((value:unknown)=>void)[]=[];
 const read=publicChainReads({request:()=>new Promise(resolve=>releases.push(resolve))} as any);
 const jobs=Array.from({length:32},(_,i)=>read(validatePublicChainRead(call(i,`0x${(i+1).toString(16)}`))));
 const limited=await read(validatePublicChainRead(call(99,'0x100')));assert.equal(limited.error?.code,-32005);assert.equal(releases.length,32);
 releases.forEach(resolve=>resolve('0x'));await Promise.all(jobs);
 const unavailable=publicChainReads({request:async()=>{throw Error('https://private.invalid/secret request body');}} as any);
 assert.deepEqual((await unavailable(validatePublicChainRead(call(1)))).error,{code:-32000,message:'Public chain read unavailable'});
});
test('public HTTP boundary cannot invoke writes; valid reads remain available while admissions close',async()=>{
 const requests:any[]=[];
 const service=await startPoolReadService({client:{request:async(args:any)=>{requests.push(args);return '0x279f';}}} as AgentPoolReader,
  {host:'127.0.0.1',port:0,public:true});
 try{
  const address=service.server.address();assert(address&&typeof address==='object');const url=`http://127.0.0.1:${address.port}/agents/chain-read`;
  const post=(body:any)=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await fetch(url)).status,405);
  assert.equal((await post({jsonrpc:'2.0',id:1,method:'eth_sendRawTransaction',params:['0x1234']})).status,400);
  assert.equal(requests.length,0);
  const result=await post({jsonrpc:'2.0',id:2,method:'eth_chainId',params:[]});assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{jsonrpc:'2.0',id:2,result:'0x279f'});assert.equal(requests.length,1);
  // Exercise the same installed client used by the real login, not a manually
  // shaped JSON-RPC body: getChainId omits params on the wire.
  assert.equal(await createPublicClient({transport:http(url,{retryCount:0})}).getChainId(),10143);
  assert.deepEqual(requests.at(-1),{method:'eth_chainId',params:[]});
 }finally{await service.close();}
});
