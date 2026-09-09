import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encodeEventTopics,keccak256,encodeAbiParameters,encodeFunctionResult,decodeFunctionData,parseTransaction,toHex,toFunctionSelector,zeroHash,zeroAddress} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {encodeSession,storageKey,delegatableAbi} from '@interludelayer-sdk/sdk';
import {roomsChaosAbi as abi} from '../shared/abi-PongRoomsTestnet.ts';
import {initial} from '../shared/physics-v2.ts';
const manifest=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8'));
const origin='https://pongit.xyz',app=manifest.app,a='0x1111111111111111111111111111111111111111',b='0x2222222222222222222222222222222222222222';
const enabled=process.env.STREAM_TEST==='events';
const subscribers=[];
const event=(name,args)=>{const e=abi.find(x=>x.type==='event'&&x.name===name);return {address:app,topics:encodeEventTopics({abi,eventName:name,args}),data:encodeAbiParameters(e.inputs.filter(x=>!x.indexed),e.inputs.filter(x=>!x.indexed).map(x=>args[x.name]))}};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const report={at:new Date().toISOString(),runtime:enabled?'stream-candidate':'e77d13b',transport:enabled?'events':'polling',network:'Isolated browser: RPC reads delayed 30 ms, sends 100 ms; no upstream requests or 429 injection',scenarios:[],errors:[]};
const start=Date.now();let state=initial(zeroHash),revision=1n,nonceA=0n,nonceB=0n,phase=2;
state={...state,t:0n};let period;
const room={id:zeroHash,host:a,kind:'ranked',mode:0,status:'playing',created:start,activity:start,members:[a,b].map((player,i)=>({player,joined:start+i,position:i,seen:start,away:false})),offer:{id:'1',room:zeroHash,a,b,mode:0,ranked:true,expires:String(Math.floor(Date.now()/1000)+120),rules:'4',entropy:zeroHash,signature:'0x',accepted:[a,b],status:'active'}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pages=[];
try{
 for(const [index,player] of [a,b].entries()){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const privateKey=generatePrivateKey(),signer=privateKeyToAccount(privateKey);let nonce=0n;
  const stored=encodeSession({app,baseChainId:10143,privateKey,signature:`0x${'11'.repeat(65)}`,grant:{granter:player,sessionKey:signer.address,expiry:BigInt(Math.floor(Date.now()/1000)+1800),epoch:0n,anyFunction:false,selectors:['acceptMatch','input','tick','cancelMatch','concede'].map(name=>toFunctionSelector(abi.find(x=>x.type==='function'&&x.name===name)))}});
  await context.addInitScript(({stored,key,accountKey,player})=>{
   sessionStorage.setItem(key,stored);sessionStorage.setItem(accountKey,player);
   localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'}));
  },{stored,key:storageKey(app,10143,player),accountKey:`pongit:rooms:${app}:account`,player});
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin===origin){
    if(u.pathname.startsWith('/api/')){
     if(period)period[index].vps++;
     return route.fulfill({json:u.pathname.endsWith('/config')?{app,online:true,admission:true,stateTransport:enabled?'events':'polling'}:u.pathname.endsWith('/auth/challenge')?{nonce:'mock',message:'Private rate measurement'}:u.pathname.endsWith('/state')?{room,profiles:[{player:a,handle:'Measure A'},{player:b,handle:'Measure B'}],inbox:[],outbox:[],online:true,admission:true}:{}});
    }
    const response=await route.fetch({url:'http://'+(process.env.TEST_WEB_HOST||'rate-web')+':3000'+u.pathname+u.search});return route.fulfill({response});
   }
   const rpc=route.request().postDataJSON(),reply=result=>route.fulfill({json:{jsonrpc:'2.0',id:rpc.id,result}});
   if(u.origin===new URL(manifest.node).origin){
    const row=period?.[index];if(row)row.rpc[rpc.method]=(row.rpc[rpc.method]||0)+1;
    if(rpc.method==='eth_chainId')return reply('0x1092');
    if(rpc.method==='eth_getTransactionCount')return reply(toHex(nonce));
    if(rpc.method==='eth_call'){
     await sleep(30);
     return reply(encodeFunctionResult({abi,functionName:'getSnapshot',result:[1n,revision,BigInt(phase),a,b,b,phase===3?a:zeroAddress,BigInt(100+Math.floor((Date.now()-start)/10)),BigInt(Date.now()-start)*1000n,nonceA,nonceB,BigInt(room.offer.expires),state]}));
    }
    if(rpc.method==='interlude_sendTransaction'){
     const tx=parseTransaction(rpc.params[0]);assert.equal(BigInt(tx.nonce),nonce++);
     const wrapper=decodeFunctionData({abi:delegatableAbi,data:tx.data}),inner=decodeFunctionData({abi,data:wrapper.args[2]});
     if(row)row.actions[inner.functionName]=(row.actions[inner.functionName]||0)+1;
     await sleep(100);revision++;state={...state,t:BigInt(Date.now()-start)*1000n};
     if(inner.functionName==='input'){
      if(index===0){nonceA=inner.args[2];state.leftDir=Number(inner.args[1]);}else{nonceB=inner.args[2];state.rightDir=Number(inner.args[1]);}
     }
     const stateParam=abi.find(x=>x.type==='function'&&x.name==='getSnapshot').outputs.at(-1);
     const logs=[event('Snapshot',{id:1n,version:revision,status:2n,state:encodeAbiParameters([stateParam],[state])})];
     const head=BigInt(100+Math.floor((Date.now()-start)/10)),hash=keccak256(rpc.params[0]);
     for(const sub of subscribers)try{sub.socket.send(JSON.stringify({jsonrpc:'2.0',method:'interlude_subscription',params:{subscription:sub.id,result:{app,to:app,hash,blockNumber:Number(head),succeeded:true,logs}}}))}catch{}
     return reply({status:'0x1',transactionHash:hash,blockNumber:toHex(head),logs,output:encodeAbiParameters([{type:'bytes'}],['0x'])});
    }
    throw Error('Unexpected engine RPC '+rpc.method);
   }
   if(u.hostname==='testnet-rpc.monad.xyz')return reply(encodeAbiParameters([{type:rpc.params?.[0]?.data===toFunctionSelector('hub()')?'address':'uint256'}],[rpc.params?.[0]?.data===toFunctionSelector('hub()')?manifest.hub:0n]));
   throw Error('Unexpected external host '+u.hostname);
  });
  await context.routeWebSocket('**/*',socket=>{
   if(socket.url()===manifest.node.replace('https:','wss:') || socket.url()===manifest.node.replace('https:','wss:')+'/'){
    const sub={socket,id:index+1,index};subscribers.push(sub);
    socket.onMessage(message=>{const request=JSON.parse(String(message));if(request.method==='interlude_subscribe')socket.send(JSON.stringify({jsonrpc:'2.0',id:request.id,result:sub.id}));});
    socket.onClose(()=>{const n=subscribers.indexOf(sub);if(n>=0)subscribers.splice(n,1);});
   }
  });
  const page=await context.newPage();pages.push(page);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin+'/rooms');await page.locator('.rooms-court').waitFor();
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Move up"]')?.disabled);
 }
 await sleep(1000);
 for(const moving of [false,true]){
  period=[a,b].map(()=>({rpc:{},actions:{},vps:0}));const began=Date.now();
  if(moving){
   for(let n=0;n<50;n++){
    const key=n%2?'ArrowUp':'ArrowDown';
    await Promise.all(pages.map(p=>p.keyboard.down(key)));await sleep(400);
    await Promise.all(pages.map(p=>p.keyboard.up(key)));await sleep(400);
   }
  }else await sleep(12000);
  const seconds=(Date.now()-began)/1000,counts=period;period=undefined;
  const players=counts.map((row,index)=>({...row,player:index===0?'A':'B',engineRps:Number((Object.values(row.rpc).reduce((s,n)=>s+n,0)/seconds).toFixed(2))}));
  report.scenarios.push({scenario:moving?'Both players change direction or release about 2.5 times/second':'Both paddles idle during an active rally',seconds,players,totalEngineRps:Number(players.reduce((s,p)=>s+p.engineRps,0).toFixed(2))});
 }
 assert.equal(report.errors.length,0);if(enabled){
  assert.equal(subscribers.length,2,'One node subscription per player');
  // Lose both subscriptions, then ensure reconnection does not multiply them.
  for(const sub of [...subscribers])sub.socket.close();
  await sleep(2500);assert.equal(subscribers.length,2,'A reconnect keeps one node socket per player');
  // The backup misses the final push. Its recovery getter must still show 7,
  // without waiting for the lobby to rotate or discarding its session.
  phase=3;revision++;state={...state,t:BigInt(Date.now()-start)*1000n,scoreA:7,scoreB:6,finished:true};
  const param=abi.find(x=>x.type==='function'&&x.name==='getSnapshot').outputs.at(-1);
  const logs=[event('Completed',{id:1n,room:zeroHash,a,b,winner:a,status:3n,mode:0,ranked:false,scoreA:7,scoreB:6,resultHash:zeroHash}),event('Snapshot',{id:1n,version:revision,status:3n,state:encodeAbiParameters([param],[state])})];
  const sub=subscribers.find(s=>s.index===0);sub.socket.send(JSON.stringify({jsonrpc:'2.0',method:'interlude_subscription',params:{subscription:sub.id,result:{app,to:app,hash:zeroHash,blockNumber:100+Math.floor((Date.now()-start)/10),succeeded:true,logs}}}));
  for(const page of pages){const result=page.getByRole('dialog',{name:'Confirmed match result'});await result.waitFor({timeout:15000});assert.equal(await result.locator('.outcome-score').textContent(),'7 : 6');}
  report.recovery=['One socket per tab after disconnection','Both players see the seventh point when one terminal notification is lost'];
 }
}finally{await browser.close();const {mkdir,writeFile}=await import('node:fs/promises');await mkdir('artifacts/stream-browser',{recursive:true});await writeFile('artifacts/stream-browser/'+(enabled?'events':'baseline')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
