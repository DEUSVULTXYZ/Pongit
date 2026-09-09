// Isolated VPS browser regression. Every service response is mocked.
import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {encodeAbiParameters,encodeFunctionResult,parseTransaction,toHex,toFunctionSelector,zeroHash,type Abi,type Address} from "viem";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {encodeSession,storageKey} from "@interludelayer-sdk/sdk";
import manifest from "../deployments/interlude-rooms.json";
import {roomsChaosAbi} from "../shared/abi-PongRoomsTestnet";
import {initial} from "../shared/physics-v2";
assert.equal(process.env.ROOMS_BROWSER_TEST,"isolated-vps");
const origin="https://pongit.xyz",app=manifest.app as Address,abi=roomsChaosAbi as Abi;
const a="0x1111111111111111111111111111111111111111",b="0x2222222222222222222222222222222222222222";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const report:any={scenarios:[],errors:[]};
let lastPage: any;
try {
 for(const failure of ["write429","ack429","expired429"]){
  const context=await browser.newContext({viewport:{width:failure==="write429"?1440:390,height:900}});
  const privateKey=generatePrivateKey(),signer=privateKeyToAccount(privateKey);
  const stored=encodeSession({app,baseChainId:10143,privateKey,signature:`0x${"11".repeat(65)}`,
   grant:{granter:a,sessionKey:signer.address,expiry:BigInt(Math.floor(Date.now()/1000)+1800),epoch:0n,anyFunction:false,
    selectors:["acceptMatch","input","tick","cancelMatch","concede"].map(name=>toFunctionSelector(abi.find(x=>x.type==="function"&&x.name===name) as any))}});
  await context.addInitScript(({stored,key,accountKey,a})=>{
   sessionStorage.setItem(key,stored);sessionStorage.setItem(accountKey,a);
   localStorage.setItem("pongit:arcade-audio",JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:"off"}));
  },{stored,key:storageKey(app,10143,a),accountKey:`pongit:rooms:${app}:account`,a});
  let room:any,phase=0,nonce=0n,sends=0,accepts=0,preflights=0,acks=0,nonceReads=0,reads=0,writeFailed=false,releaseAck=false;
  const at=Date.now();
  await context.route("**/*",async route=>{
   const u=new URL(route.request().url());
   if(u.origin===origin){
    if(u.pathname.startsWith("/api/")){
     if(u.pathname.endsWith("/offers/accept")){
      const body=route.request().postDataJSON();
      if(body.receiptHash){
       acks++;assert.equal(phase,1,"Receipt acknowledgement must follow engine acceptance");
       if(failure==="ack429"&&!releaseAck)return route.fulfill({status:429,headers:{"Retry-After":"2"},json:{error:"Node busy"}});
       room.offer.accepted=[a];return route.fulfill({json:{offer:room.offer,alreadyAccepted:true}});
      }
      preflights++;assert.equal(room.offer.accepted.length,0,"Preflight must not mark acceptance");
      return route.fulfill({json:{offer:room.offer,alreadyAccepted:false}});
     }
     const data=u.pathname.endsWith("/config")?{app,online:true,admission:true}:
      u.pathname.endsWith("/auth/challenge")?{nonce:"mock",message:"Private acceptance test"}:
      u.pathname.endsWith("/state")?{...(room?{room}:{queue:{at,mode:0}}),profiles:[{player:a,handle:"test1"},{player:b,handle:"test2"}],inbox:[],outbox:[],online:true,admission:true}:{};
     return route.fulfill({json:data});
    }
    const response=await route.fetch({url:"http://recovery-web:3000"+u.pathname+u.search});return route.fulfill({response});
   }
   const rpc=route.request().postDataJSON();
   const reply=(result:unknown)=>route.fulfill({json:{jsonrpc:"2.0",id:rpc.id,result}});
   if(u.origin===new URL(manifest.node).origin){
    if(rpc.method==="eth_chainId")return reply("0x1092");
    if(rpc.method==="eth_getTransactionCount"){nonceReads++;return reply(toHex(nonce));}
    if(rpc.method==="eth_call"){reads++;return reply(encodeFunctionResult({abi,functionName:"getSnapshot",result:[1n,BigInt(phase),BigInt(phase),a,b,b,b,100n,0n,0n,0n,BigInt(Math.floor(Date.now()/1000)+20),initial(zeroHash)]}));}
    if(rpc.method==="interlude_sendTransaction"){
     sends++;assert.equal(BigInt(parseTransaction(rpc.params[0]).nonce!),nonce,"Retry must restore the SDK nonce");
     if(failure!=="ack429"&&!writeFailed){writeFailed=true;return route.fulfill({status:429,headers:{"Retry-After":failure==="expired429"?"10":"2","Access-Control-Allow-Origin":"*","Access-Control-Expose-Headers":"Retry-After"},body:"Too many requests"});}
     nonce++;if(phase===0){phase=1;accepts++;}
     return reply({status:"0x1",transactionHash:zeroHash,output:encodeAbiParameters([{type:"bytes"}],["0x"])});
    }
    throw Error("Unexpected RPC "+rpc.method);
   }
   if(u.hostname==="testnet-rpc.monad.xyz")return reply(encodeAbiParameters([{type:rpc.params?.[0]?.data===toFunctionSelector("hub()")?"address":"uint256"}],[rpc.params?.[0]?.data===toFunctionSelector("hub()")?manifest.hub as Address:0n]));
   throw Error("Unexpected external host "+u.hostname);
  });
  await context.routeWebSocket("**/*",()=>{});
  const page=await context.newPage();lastPage=page;page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(origin+"/rooms");await page.locator(".rooms-timer").waitFor();
  room={id:zeroHash,host:a,kind:"ranked",mode:0,status:"offer",created:at,activity:at,members:[a,b].map((player,position)=>({player,position,joined:at,seen:Date.now(),away:false})),offer:{id:"1",room:zeroHash,a,b,mode:0,ranked:true,expires:String(Math.floor(Date.now()/1000)+20),rules:"4",entropy:zeroHash,signature:"0x",accepted:[],status:"offered"}};
  const acceptButton=page.getByRole("button",{name:"Accept",exact:true});await acceptButton.waitFor();
  const initialReads=reads;await page.waitForTimeout(6200);
  const idleReads=reads-initialReads;assert(idleReads<=4,`Waiting for a duel made ${idleReads} reads in 6s`);
  await acceptButton.click();
  if(failure==="expired429"){
   const cooling=page.getByRole("button",{name:/^Retry in \d+s$/});await cooling.waitFor();assert(await cooling.isDisabled());
   room.offer.status="cancelled";room.status="waiting";room.members.forEach((m:any)=>m.away=true);
   await page.getByRole("button",{name:"Rejoin queue",exact:true}).waitFor();
   assert.equal(await page.getByText("The game node limited this request.",{exact:false}).count(),0,"An expired offer must not retain its acceptance error");
   await page.waitForTimeout(11000);const terminalReads=reads;await page.waitForTimeout(4200);
   assert.equal(reads,terminalReads,"Cancelled empty matches stop RPC polling");assert.equal(sends,1,"Expired acceptances are never resent");
   report.scenarios.push({failure,idleReads,expiredMessageCleared:true,terminalPollingStopped:true,acceptanceSends:sends});
   await context.close();continue;
  }
  if(failure==="write429"){
   const cooling=page.getByRole("button",{name:/^Retry in \d+s$/});await cooling.waitFor();assert(await cooling.isDisabled());
   const retry=page.getByRole("button",{name:"Retry acceptance",exact:true});await retry.waitFor();
   assert.equal(sends,1,"No automatic resubmission after a 429");
   await retry.click();await page.getByRole("button",{name:"Waiting…",exact:true}).waitFor({timeout:8000});
   assert(nonceReads>=2);assert.equal(accepts,1);
  }else{
   await page.getByText("Acceptance received. Synchronizing the duel.",{exact:true}).waitFor();
   await page.reload();await page.getByRole("button",{name:"Waiting…",exact:true}).waitFor();
   assert.equal(accepts,1,"F5 must recover the receipt, not sign another acceptance");
   releaseAck=true;
  }
  const until=Date.now()+8000;while(!room.offer.accepted.includes(a)&&Date.now()<until)await page.waitForTimeout(100);
  assert(room.offer.accepted.includes(a));
  await page.waitForFunction(key=>!sessionStorage.getItem(key),`pongit:rooms:${app}:acceptance:${a}`,{timeout:5000});
  const acceptanceSends=sends;
  assert.equal(acceptanceSends,failure==="write429"?2:1,"Accepted transactions are never resent");
  phase=2;room.status="playing";room.offer.status="active";room.offer.accepted=[a,b];
  await page.locator(".rooms-court").waitFor();
  assert.equal(accepts,1);assert.equal(report.errors.length,0);
  report.scenarios.push({failure,idleReads,preflights,acks,acceptanceSends,nonceReads,started:true});
  await context.close();
 }
}finally{
 if(report.scenarios.length<3 && lastPage && !lastPage.isClosed())report.page=await lastPage.locator("body").innerText();
 await mkdir("artifacts/rooms-acceptance-browser",{recursive:true});
 await writeFile("artifacts/rooms-acceptance-browser/report.json",JSON.stringify(report,null,2));await browser.close();
}
console.log(JSON.stringify(report));
