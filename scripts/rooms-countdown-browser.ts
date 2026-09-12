// HTTPS-origin browser validation; every chain/API response is simulated.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {encodeAbiParameters,encodeFunctionResult,parseTransaction,decodeFunctionData,toHex,toFunctionSelector,zeroHash,zeroAddress,keccak256,type Abi,type Address} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {encodeSession,storageKey,delegatableAbi} from '@interludelayer-sdk/sdk';
import {prepareRoomLaunch,assertRoomLaunchReady} from '../shared/rooms-acceptance';
import {initial} from '../shared/physics-v2';
import manifest from '../deployments/interlude-rooms.json';
import {roomsChaosAbi} from '../shared/abi-PongRoomsTestnet';
assert.equal(process.env.ROOMS_BROWSER_TEST,'isolated-vps');
const origin='https://pongit.xyz',app=manifest.app as Address,abi=roomsChaosAbi as Abi;
const players=['0x1111111111111111111111111111111111111111','0x2222222222222222222222222222222222222222'];
const serverNow=()=>Date.now()+28000;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
const report:any={scope:'Simulated API and chain, real browser against production build',scenarios:[],errors:[]};
await mkdir('artifacts/rooms-countdown',{recursive:true});
try{
 for(const mode of [0,1]){
  let room:any,phase=0,revision=0n,paused=false,sends=0;
  const accepted=new Set<string>(),sentAt:number[]=[],queuedAt=serverNow();
  const contexts=[],pages=[];
  for(const [index,player] of players.entries()){
   const context=await browser.newContext({viewport:{width:index?390:1440,height:index?844:900},reducedMotion:mode?'reduce':'no-preference'});contexts.push(context);
   const privateKey=generatePrivateKey(),signer=privateKeyToAccount(privateKey);
   const saved=encodeSession({app,baseChainId:10143,privateKey,signature:`0x${'11'.repeat(65)}`,grant:{granter:player as Address,sessionKey:signer.address,expiry:BigInt(Math.floor(serverNow()/1000)+1800),epoch:0n,anyFunction:false,selectors:['acceptMatch','input','tick','cancelMatch','concede'].map(name=>toFunctionSelector(abi.find(x=>x.type==='function'&&x.name===name) as any))}});
   await context.addInitScript(({saved,key,accountKey,player})=>{sessionStorage.setItem(key,saved);sessionStorage.setItem(accountKey,player);localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'}));},{saved,key:storageKey(app,10143,player as Address),accountKey:`pongit:rooms:${app}:account`,player});
   let nonce=0;
   await context.route('**/*',async route=>{
    try{
     const u=new URL(route.request().url());
     if(u.origin===origin){
      if(u.pathname.startsWith('/api/')){
       const body=route.request().postData()?route.request().postDataJSON():{};let data:any={};
       if(u.pathname.endsWith('/config'))data={app,online:true,admission:true};
       else if(u.pathname.endsWith('/auth/challenge'))data={nonce:'mock',message:'Private countdown fixture'};
       else if(u.pathname.endsWith('/state'))data={...(room?{room}:{queue:{at:queuedAt,mode}}),profiles:players.map((p,i)=>({player:p,handle:`Player${i+1}`})),inbox:[],outbox:[],online:true,admission:true};
       else if(u.pathname.endsWith('/offers/ready')){prepareRoomLaunch(room.offer,player,serverNow());data={offer:room.offer};}
       else if(u.pathname.endsWith('/offers/accept')){if(!body.receiptHash)assertRoomLaunchReady(room.offer,serverNow());data={offer:room.offer,alreadyAccepted:accepted.has(player)};}
       else if(u.pathname.includes('/markets/'))data={app,id:'1',rally:1,phase:'preparing',blocksLeft:'0'};
       return route.fulfill({json:{...data,serverNow:serverNow()}});
      }
      return route.fulfill({response:await route.fetch({url:'http://countdown-web:3000'+u.pathname+u.search})});
     }
     const rpc=route.request().postDataJSON(),reply=(result:unknown)=>route.fulfill({json:{jsonrpc:'2.0',id:rpc.id,result}});
     if(u.origin===new URL(manifest.node).origin){
      if(rpc.method==='interlude_session')return reply({app,chainId:4242,epoch:0,ephemeralBlock:100,execTimestamp:Math.floor(serverNow()/1000),pendingDiffs:[]});
      if(rpc.method==='eth_chainId')return reply('0x1092');
      if(rpc.method==='eth_getTransactionCount')return reply(toHex(nonce));
      if(rpc.method==='eth_call'){
       const state={...initial(zeroHash,mode as 0|1),...(paused?{scoreA:1,awaitingServe:true,vx:0n,vy:0n,resumeAt:3000000n}:{})};
       return reply(encodeFunctionResult({abi,functionName:'getSnapshot',result:[1n,revision,BigInt(phase),players[0],players[1],zeroAddress,zeroAddress,100n+revision,0n,0n,0n,BigInt(room?.offer.expires||0),state] as any}));
      }
      if(rpc.method==='interlude_sendTransaction'){
       const tx=parseTransaction(rpc.params[0]),wrapped=decodeFunctionData({abi:delegatableAbi,data:tx.data!});
       assert.equal(wrapped.functionName,'withSession');const inner=decodeFunctionData({abi,data:(wrapped.args as any)[2]});
       if(inner.functionName==='acceptMatch'){
        assert(serverNow()>=room.offer.launch.at,'No engine acceptance before the countdown ends');assert(!accepted.has(player),'No duplicate acceptance');accepted.add(player);sentAt.push(serverNow());sends++;
        room.offer.accepted=[...accepted];phase=accepted.size===2?2:1;if(phase===2){room.offer.status='active';room.status='playing';}
       }
       nonce++;revision++;
       return reply({status:'0x1',transactionHash:keccak256(rpc.params[0]),output:encodeAbiParameters([{type:'bytes'}],['0x']),logs:[]});
      }
      throw Error('Unexpected engine method '+rpc.method);
     }
     if(u.hostname==='testnet-rpc.monad.xyz')return reply(encodeAbiParameters([{type:rpc.params?.[0]?.data===toFunctionSelector('hub()')?'address':'uint256'}],[rpc.params?.[0]?.data===toFunctionSelector('hub()')?manifest.hub as Address:0n]));
     throw Error('Unexpected network destination '+u.hostname);
    }catch(e){report.errors.push(String(e));await route.fulfill({status:500,json:{error:'Test fixture failed'}});}
   });
   await context.routeWebSocket('**/*',()=>{});
   const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));pages.push(page);
   await page.goto(origin+'/rooms');await page.locator('.rooms-timer').waitFor();
  }
  const before=await pages[0].locator('.rooms-timer').innerText();await pages[0].waitForTimeout(2200);const after=await pages[0].locator('.rooms-timer').innerText();assert.notEqual(before,after,'Queue must advance during a 28-second wall-clock mismatch');
  room={id:zeroHash,host:players[0],kind:'ranked',mode,status:'offer',created:serverNow(),activity:serverNow(),members:players.map((player,position)=>({player,position,joined:serverNow(),seen:serverNow(),away:false})),offer:{id:'1',room:zeroHash,a:players[0],b:players[1],mode,ranked:true,expires:String(Math.floor(serverNow()/1000)+30),rules:'4',entropy:zeroHash,signature:'0x',accepted:[],status:'offered'}};
  await pages[0].getByRole('button',{name:'Accept',exact:true}).click();await pages[0].getByText('Waiting for your rival',{exact:true}).waitFor();assert.equal(sends,0);
  // F5 preserves readiness; no signature is sent while the second player has not agreed.
  await pages[0].reload();await pages[0].getByText('Waiting for your rival',{exact:true}).waitFor();assert.equal(sends,0);
  await pages[1].getByRole('button',{name:'Accept',exact:true}).click();
  await pages[1].locator('.match-countdown-digit').filter({hasText:'3'}).waitFor();
  await pages[1].screenshot({path:`artifacts/rooms-countdown/${mode?'chaos':'classic'}-intro.png`});
  if(mode)assert.equal(await pages[1].locator('.match-countdown-digit').evaluate(el=>getComputedStyle(el).animationName),'none');
  else assert.equal(await pages[1].locator('.match-countdown-digit').evaluate(el=>getComputedStyle(el).animationName),'match-countdown-pop');
  for(const digit of ['2','1'])await pages[1].locator('.match-countdown-digit').filter({hasText:digit}).waitFor();
  for(const page of pages)await page.locator('.rooms-court:not(.rooms-intro)').waitFor({timeout:15000});
  assert.equal(sends,2);assert(sentAt.every(at=>at>=room.offer.launch.at));
  if(mode){paused=true;revision++;await pages[1].getByText('Synchronizing Chaos bets',{exact:true}).waitFor();}
  for(const page of pages)assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  report.scenarios.push({mode,queueBefore:before,queueAfter:after,clockSkewMs:28000,engineAcceptances:sends,startDelayMs:sentAt.map(at=>at-(room.offer.launch.at-3000)),f5Ready:true,reducedMotion:!!mode});
  await Promise.all(contexts.map(c=>c.close()));
 }
 assert.equal(report.errors.length,0);report.passed=true;
}finally{await writeFile('artifacts/rooms-countdown/report.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify(report));
