import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WebSocketServer} from 'ws';
import {createPublicClient,keccak256,parseAbi,parseTransaction,type Hex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {engineTransport} from '../shared/engine-transport';
import {compactArenaSession} from '../shared/compact-arena-session';
import {RoomsCommandJournal} from '../web/lib/rooms-command-journal';

for(const delayed of ['execution','response'] as const)test(`actual socket ${delayed} tail preserves one effect and nonce through HTTP recovery`,async()=>{
 const app='0x0000000000000000000000000000000000000011';
 const abi=parseAbi(['function input(uint256 epoch,uint256 id,int8 direction,uint256 sequence,uint256 deadline)']);
 const key=generatePrivateKey(),account=privateKeyToAccount(key);
 let stored:string|null=null,nonce=0,wsCalls=0,httpCalls=0,lookupCalls=0;
 const effects:number[]=[],receivedRaw:Hex[]=[],known=new Map<Hex,object>(),timers:ReturnType<typeof setTimeout>[]=[];
 const execute=(raw:Hex)=>{
  const tx=parseTransaction(raw);receivedRaw.push(raw);
  if(tx.nonce!==nonce)return {error:{code:-32000,message:'nonce too low'}};
  const receipt={transactionHash:keccak256(raw),status:'0x1',blockNumber:'0x42',logs:[],output:'0x'};
  effects.push(tx.nonce);nonce++;known.set(receipt.transactionHash,receipt);return {result:receipt};
 };
 const server=createServer((request,response)=>{
  let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{
   const p=JSON.parse(body);let answer:object;
   if(p.method==='eth_getTransactionReceipt'){lookupCalls++;answer={result:known.get(p.params[0])??null};}
   else if(p.method==='eth_getTransactionCount')answer={result:'0x'+nonce.toString(16)};
   else if(p.method==='interlude_sendTransaction'){httpCalls++;answer=execute(p.params[0]);}
   else answer={error:{code:-32601,message:'unsupported'}};
   response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({jsonrpc:'2.0',id:p.id,...answer}));
  });
 });
 const sockets=new WebSocketServer({server});
 const connected=new Promise<void>(resolve=>sockets.once('connection',()=>resolve()));
 sockets.on('connection',socket=>socket.on('message',bytes=>{
  const p=JSON.parse(String(bytes));assert.equal(p.method,'interlude_sendTransaction');wsCalls++;
  const early=delayed==='response'?execute(p.params[0]):undefined;
  timers.push(setTimeout(()=>{
   const answer=early??execute(p.params[0]);if(socket.readyState===1)socket.send(JSON.stringify({jsonrpc:'2.0',id:p.id,...answer}));
  },700));
 }));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert(address&&typeof address!=='string');
 const journal=new RoomsCommandJournal({getItem:()=>stored,setItem:(_k,v)=>{stored=v;}},app,abi);
 journal.received('interlude_session',{app,chainId:4242,epoch:1});journal.bindDirect(account.address,1n,7n,9000000000n,true);
 const node=createPublicClient({transport:engineTransport(`http://127.0.0.1:${address.port}`,journal,true)});
 try{
  await connected;await new Promise(resolve=>setTimeout(resolve,25));
  const sender=compactArenaSession({node,abi,app,key,epoch:1n,match:7n,expires:9000000000n});
  await sender.prepare();const start=performance.now();
  await sender.send('input',[1n,7n,1,1n,200n]);
  assert(performance.now()-start<500,'Recovery must finish before the presence credit expires');
  assert.equal(journal.pending(account.address),undefined);
  await sender.send('input',[1n,7n,0,2n,200n]);
  await new Promise(resolve=>setTimeout(resolve,750));
  assert.deepEqual(effects,[0,1]);assert.equal(nonce,2);assert.equal(wsCalls,1);assert.equal(lookupCalls,1);
  assert.equal(httpCalls,delayed==='execution'?2:1);
  const rows=JSON.parse(stored!);assert.equal(rows.length,2);assert(rows.every((r:any)=>r.state==='confirmed'));
  if(delayed==='execution')assert.equal(receivedRaw[0],receivedRaw[2],'Delayed socket copy retains exactly the journaled bytes');
 }finally{
  (node.transport as any).closeSend?.();for(const timer of timers)clearTimeout(timer);
  for(const socket of sockets.clients)socket.terminate();await new Promise<void>(resolve=>sockets.close(()=>resolve()));
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
