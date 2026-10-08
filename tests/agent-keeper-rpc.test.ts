import test from 'node:test';
import assert from 'node:assert/strict';
import {keeperRpcFetch} from '../shared/agent-keeper-rpc';
import {foregroundRpcRequest,transactionRpcRequest} from '../relayer/src/rpc-scheduler';

test('admission canonical hydration is foreground; history and writes keep gateway rules',async()=>{
 const sent:Array<{body:any;headers:Headers;signal:AbortSignal|null|undefined}>=[];
 const fetcher:typeof fetch=async(input,init)=>{
  assert.equal(input,'http://rpc:8545');
  sent.push({body:JSON.parse(init!.body as string),headers:new Headers(init?.headers),signal:init?.signal});
  return new Response('{"jsonrpc":"2.0","id":13,"result":"0x01"}');
 };
 const foreground=keeperRpcFetch('admission',fetcher),signal=new AbortController().signal;
 const call={to:'0x1111111111111111111111111111111111111111',data:'0x12345678'};
 for(const [method,params] of [
  ['eth_call',[call,'0x100']],
  ['eth_call',[call,'0x10']],
  ['eth_sendRawTransaction',['0xabcd']],
 ] as const){
  const body=JSON.stringify({jsonrpc:'2.0',id:13,method,params});
  const response=await foreground('http://rpc:8545',{method:'POST',headers:{'content-type':'application/json'},body,signal});
  assert.equal((await response.json()).result,'0x01');
  const actual=sent.at(-1)!;
  assert.deepEqual(actual.body,JSON.parse(body));assert.equal(actual.signal,signal);
  assert.equal(actual.headers.get('content-type'),'application/json');
 }
 assert(foregroundRpcRequest(sent[0].body.method,sent[0].body.params,sent[0].headers.get('x-pongit-rpc-foreground')==='1',0x100n));
 assert(!foregroundRpcRequest(sent[1].body.method,sent[1].body.params,true,0x100n));
 assert(!foregroundRpcRequest(sent[2].body.method,sent[2].body.params,true,0x100n));
 assert(transactionRpcRequest(sent[2].body.method,sent[2].body.params));
});

test('archive, maintenance and legacy transports receive no extra priority',()=>{
 const fetcher:typeof fetch=async()=>new Response('{}');
 for(const role of ['archive','maintenance','legacy'] as const)assert.equal(keeperRpcFetch(role,fetcher),fetcher);
});
