// Measure the complete, short-lived operator step without changing its nonce
// owner or transport behavior. Never persist URLs, parameters or response bodies.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {recordRpc} from '../shared/rpc-metrics';

const script=process.argv[2];
assert(['scripts/agent-lifecycle.ts','scripts/agent-archive-step.ts'].includes(script));
const role=script.includes('lifecycle')?'lifecycle':'archive';
const close=process.env.PONG_AGENT_DIAGNOSTICS?await agentMetrics(process.env.PONG_AGENT_DIAGNOSTICS,role):async()=>{};
const original=globalThis.fetch;
const baseOrigin=new URL(process.env.RPC_URL||'https://testnet-rpc.monad.xyz').origin;
if(process.env.PONG_AGENT_DIAGNOSTICS)globalThis.fetch=async(input,init)=>{
 const at=Date.now();let method='http';
 try{const body=JSON.parse(typeof init?.body==='string'?init.body:'{}');if(typeof body.method==='string'&&/^[\w.]{1,80}$/.test(body.method))method=body.method;}catch{}
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 const target=new URL(url).origin===baseOrigin?'monad':'interlude';
 const requestBytes=typeof init?.body==='string'?Buffer.byteLength(init.body):undefined;
 try{
  const response=await original(input,init);
  recordRpc({at,target,method,status:response.status,ms:Date.now()-at,source:'network',requestBytes});
  return response;
 }catch(error){recordRpc({at,target,method,status:0,ms:Date.now()-at,source:'network',requestBytes});throw error;}
};
try{await import(pathToFileURL(resolve(script)).href);}
finally{globalThis.fetch=original;await close();}
