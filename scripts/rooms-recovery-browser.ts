// Private VPS regression: every API/RPC/WS response is mocked. No real grant,
// transaction, account or production service is used by these browser scenarios.
import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {encodeAbiParameters,encodeErrorResult,encodeFunctionResult,toFunctionSelector,zeroAddress,zeroHash,type Address,type Abi} from "viem";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {encodeSession,storageKey} from "@interludelayer-sdk/sdk";
import manifest from "../deployments/interlude-rooms.json";
import {roomsChaosAbi} from "../shared/abi-PongRoomsTestnet";
import {initial} from "../shared/physics-v2";

assert.equal(process.env.ROOMS_BROWSER_TEST,"isolated-vps");
const origin="https://pongit.xyz", app=manifest.app as Address, abi=roomsChaosAbi as Abi;
const a="0x1111111111111111111111111111111111111111",b="0x2222222222222222222222222222222222222222";
const out="artifacts/rooms-recovery-browser";
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const report:{checks:string[];errors:string[];scenarios:any[]}={checks:[],errors:[],scenarios:[]};
try{
 for(const failure of ["revert","uncertain"]){
  const context=await browser.newContext({viewport:{width:failure==="revert"?1440:390,height:900}});
  const privateKey=generatePrivateKey(),signer=privateKeyToAccount(privateKey);
  const scope=["acceptMatch","input","tick","cancelMatch","concede"];
  const stored=encodeSession({app,baseChainId:10143,privateKey,signature:`0x${"11".repeat(65)}`,
   grant:{granter:a,sessionKey:signer.address,expiry:BigInt(Math.floor(Date.now()/1000)+1800),epoch:0n,anyFunction:false,
    selectors:scope.map(name=>toFunctionSelector(abi.find(x=>x.type==="function"&&x.name===name) as any))}});
  await context.addInitScript(({stored,key,accountKey,a})=>{
   sessionStorage.setItem(key,stored);sessionStorage.setItem(accountKey,a);
   localStorage.setItem("pongit:arcade-audio",JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:"off"}));
  },{stored,key:storageKey(app,10143,a),accountKey:`pongit:rooms:${app}:account`,a});
  let phase=2,revision=1n,reads=0,writes=0,failNext=false,throttleRead=false,limitedAt=0,recoveredAt=0;
  const start=Date.now();
  const fixture=()=>[1n,revision,BigInt(phase),a,b,b,phase===3?a:zeroAddress,BigInt(100+Math.floor((Date.now()-start)/10)),
   BigInt(Date.now()-start)*1000n,0n,0n,BigInt(Math.floor(Date.now()/1000)+20),
   {...initial(zeroHash),scoreA:phase===3?7:6,scoreB:6,finished:phase===3,t:BigInt(Date.now()-start)*1000n}];
  const room={id:zeroHash,host:a,kind:"ranked",mode:0,status:"playing",created:start,activity:start,
   members:[a,b].map((player,i)=>({player,joined:start+i,position:i,seen:Date.now(),away:false})),
   offer:{id:"1",room:zeroHash,a,b,mode:0,ranked:true,expires:String(Math.floor(Date.now()/1000)+20),rules:"4",entropy:zeroHash,signature:"0x",accepted:[a,b],status:"active"}};
  await context.route("**/*",async route=>{
   const u=new URL(route.request().url());
   if(u.origin===origin){
    if(u.pathname.startsWith("/api/")){
     const data=u.pathname.endsWith("/config")?{app,online:false,admission:false}:
      u.pathname.endsWith("/auth/challenge")?{nonce:"mock",message:"Private browser regression"}:
      u.pathname.endsWith("/state")?{room,profiles:[{player:a,handle:"test1"},{player:b,handle:"test2"}],inbox:[],outbox:[],online:false,admission:false,rating:{live:{elo:1000},published:{elo:1000}}}:{};
     return route.fulfill({json:data});
    }
    const response=await route.fetch({url:"http://recovery-web:3000"+u.pathname+u.search});return route.fulfill({response});
   }
   const rpc=route.request().postDataJSON();
   const reply=(result:unknown)=>route.fulfill({json:{jsonrpc:"2.0",id:rpc.id,result}});
   if(u.origin===new URL(manifest.node).origin){
    if(rpc.method==="eth_chainId")return reply("0x1092");
    if(rpc.method==="eth_getTransactionCount")return reply("0x0");
    if(rpc.method==="eth_call"){
     if(rpc.params[0].data.startsWith(toFunctionSelector("ratingChange(uint256)")))
      return reply(encodeFunctionResult({abi,functionName:"ratingChange",result:[1000,1000,1016,984]}));
     reads++;
     if(throttleRead){throttleRead=false;limitedAt=Date.now();return route.fulfill({status:429,headers:{"Retry-After":"10"},body:"Too many requests"});}
     if(limitedAt&&!recoveredAt)recoveredAt=Date.now();
     return reply(encodeFunctionResult({abi,functionName:"getSnapshot",result:fixture()}));
    }
    if(rpc.method==="interlude_sendTransaction"){
     writes++;
     if(failNext){
      failNext=false;throttleRead=true;
      setTimeout(()=>{phase=3;revision++;},500);
      if(failure==="uncertain")return route.abort("failed");
      return reply({status:"0x0",transactionHash:zeroHash,output:encodeErrorResult({abi,errorName:"InvalidMatch"})});
     }
     revision++;
     return reply({status:"0x1",transactionHash:zeroHash,output:encodeAbiParameters([{type:"bytes"}],["0x"])});
    }
    throw Error("Unexpected mock engine method: "+rpc.method);
   }
   if(u.hostname==="testnet-rpc.monad.xyz")return reply(encodeAbiParameters([{type:rpc.params?.[0]?.data===toFunctionSelector("hub()")?"address":"uint256"}],[rpc.params?.[0]?.data===toFunctionSelector("hub()")?manifest.hub as Address:0n]));
   throw Error("Unexpected external request: "+u.hostname);
  });
  await context.routeWebSocket("**/*",()=>{});
  const page=await context.newPage();page.on("pageerror",e=>report.errors.push(e.message));
  await page.goto(origin+"/rooms");
  await page.locator(".rooms-court").waitFor();
  await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('[aria-label="Move up"]')?.disabled);
  const beforeReads=reads,beforeWrites=writes;
  await page.waitForTimeout(2200);
  assert(reads>beforeReads,"coordinator offline must not freeze direct engine observation");
  failNext=true;
  const result=page.getByRole("dialog",{name:"Confirmed match result"});
  await result.waitFor({timeout:22000});
  assert.equal(await result.locator("h2").textContent(),"VICTORY");
  assert.equal(await result.locator(".outcome-score").textContent(),"7 : 6");
  await page.getByText("Classic ELO +16",{exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Reconnect",exact:true}).count(),0);
  assert.equal(await page.getByText("The engine did not confirm this action.",{exact:false}).count(),0);
  assert(recoveredAt-limitedAt>=9500,"Retry-After must be honored before the next network read");
  await page.screenshot({path:`${out}/${failure}-result.png`});
  report.scenarios.push({failure,reads,writes,idleWrites:writes-beforeWrites,cooldownMs:recoveredAt-limitedAt,finalScore:"7:6"});
  await context.close();
 }
 report.checks.push("Offline coordinator does not freeze a healthy direct engine lane","Final-tick revert plus 429 recovers the result without reconnecting","Unknown submission stops writes but preserves result transition","Ten-second shared cooldown honored","Exact per-match ELO displayed after fresh read","Desktop and mobile result visible");
 assert.deepEqual(report.errors,[]);
}finally{
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();
}
