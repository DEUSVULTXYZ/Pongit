// Private VPS regression: every API/RPC/WS response is mocked. No real grant,
// transaction, account or production service is used by these browser scenarios.
import {chromium} from "@playwright/test";
import assert from "node:assert/strict";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {encodeAbiParameters,encodeErrorResult,encodeFunctionResult,decodeFunctionData,parseTransaction,keccak256,toHex,toFunctionSelector,zeroAddress,zeroHash,type Address,type Abi} from "viem";
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {encodeSession,storageKey} from "@interludelayer-sdk/sdk";
import manifest from "../deployments/interlude-rooms.json";
import {roomsChaosAbi} from "../shared/abi-PongRoomsTestnet";
import {initial} from "../shared/physics-v2";

assert.equal(process.env.ROOMS_BROWSER_TEST,"isolated-vps");
const origin="https://pongit.xyz", app=manifest.app as Address, abi=roomsChaosAbi as Abi;
const a="0x1111111111111111111111111111111111111111",b="0x2222222222222222222222222222222222222222";
const out=process.env.ROOMS_BROWSER_REPORT||"artifacts/rooms-recovery-browser";
assert(out.startsWith('artifacts/'));
// Reuse the exact public frontend bytes built on the VPS for Windows Chrome/Edge.
// RPC and business routes remain independent dynamic fixtures. No local service runs.
const assets:Record<string,{status:number;headers:Record<string,string>;body:string}>=process.env.ROOMS_BROWSER_ASSETS?JSON.parse(await readFile(process.env.ROOMS_BROWSER_ASSETS,'utf8')):{};
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.ROOMS_BROWSER_PATH,args:["--no-sandbox"]});
const report:{checks:string[];errors:string[];scenarios:any[]}={checks:[],errors:[],scenarios:[]};
try{
 for(const failure of ["revert","uncertain","unsent","cancelled"]){
  const viewport={width:Number(process.env.ROOMS_BROWSER_WIDTH)||(failure==="revert"?1440:390),height:Number(process.env.ROOMS_BROWSER_HEIGHT)||900};
  const context=await browser.newContext({viewport});
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
  let nextPhase=0,acceptNext=false,chainNonce=0n,nonceReads=0,processed=0n;
  const receipts=new Map<string,any>();
  const start=Date.now();
  const fixture=(id=1n)=>[id,revision,BigInt(id===1n?phase:nextPhase),a,b,b,id===1n&&phase===3?a:zeroAddress,BigInt(100+Math.floor((Date.now()-start)/10)),
   BigInt(Date.now()-start)*1000n,0n,0n,BigInt(Math.floor(Date.now()/1000)+20),
   {...initial(zeroHash),scoreA:id===1n?(phase===3?7:6):0,scoreB:id===1n?6:0,finished:id===1n&&phase>=3,t:processed}];
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
    const key=u.pathname+u.search;
    if(process.env.ROOMS_BROWSER_ASSETS){
      if(u.pathname==='/icon.svg'&&!assets[key])return route.fulfill({contentType:'image/svg+xml',body:await readFile('web/app/icon.svg')});
      const a=assets[key];assert(a,`Frontend fixture missing ${key}`);return route.fulfill({status:a.status,headers:a.headers,body:Buffer.from(a.body,'base64')});
    }
    const response=await route.fetch({url:(process.env.ROOMS_BROWSER_WEB||"http://recovery-web:3000")+key});
    const headers={...response.headers()};delete headers['content-encoding'];delete headers['content-length'];
    assets[key]={status:response.status(),headers,body:(await response.body()).toString('base64')};
    return route.fulfill({response});
   }
   const rpc=route.request().postDataJSON();
   const reply=(result:unknown)=>route.fulfill({json:{jsonrpc:"2.0",id:rpc.id,result}});
   if(u.origin===new URL(manifest.node).origin){
    if(rpc.method==='interlude_session')return reply({app,chainId:4242,epoch:1,committedBatch:1,pendingDiffs:0});
    if(rpc.method==='eth_getTransactionReceipt')return reply(receipts.get(rpc.params[0])||null);
    if(rpc.method==="eth_chainId")return reply("0x1092");
    if(rpc.method==="eth_getTransactionCount"){nonceReads++;return reply(toHex(chainNonce));}
    if(rpc.method==="eth_call"){
     if(rpc.params[0].data.startsWith(toFunctionSelector("ratingChange(uint256)")))
      return reply(encodeFunctionResult({abi,functionName:"ratingChange",result:[1000,1000,1016,984]}));
     reads++;
     if(throttleRead){throttleRead=false;limitedAt=Date.now();return route.fulfill({status:429,headers:{"Retry-After":"10"},body:"Too many requests"});}
     if(limitedAt&&!recoveredAt)recoveredAt=Date.now();
     const decoded=decodeFunctionData({abi,data:rpc.params[0].data});
     return reply(encodeFunctionResult({abi,functionName:"getSnapshot",result:fixture(BigInt(decoded.args![0] as bigint))}));
    }
    if(rpc.method==="interlude_sendTransaction"){
     writes++;
     const hash=keccak256(rpc.params[0]);
     if(receipts.has(hash))return reply(receipts.get(hash));
     assert.equal(BigInt(parseTransaction(rpc.params[0]).nonce!),chainNonce,"SDK transaction nonce must match the engine after recovery");
     if(failNext){
      failNext=false;throttleRead=true;
      setTimeout(()=>{phase=failure==='cancelled'?4:3;revision++;},500);
      setTimeout(()=>{room.offer={...room.offer,id:"2",status:"offered",accepted:[],expires:String(Math.floor(Date.now()/1000)+20)};room.status="offer";},1500);
      if(failure==='unsent')return route.abort('failed');
      chainNonce++;
      const receipt={status:"0x0",transactionHash:hash,output:encodeErrorResult({abi,errorName:"InvalidMatch"})};
      receipts.set(hash,receipt);
      if(failure==="uncertain")return route.abort("failed");
      return reply(receipt);
     }
     revision++;processed=BigInt(Date.now()-start)*1000n;
     chainNonce++;
     if(acceptNext){acceptNext=false;nextPhase=2;room.offer.status="active";room.offer.accepted=[a,b];}
     const receipt={status:"0x1",transactionHash:hash,output:encodeAbiParameters([{type:"bytes"}],["0x"])};
     receipts.set(hash,receipt);return reply(receipt);
    }
    throw Error("Unexpected mock engine method: "+rpc.method);
   }
   if(u.hostname==="testnet-rpc.monad.xyz"){
    if(rpc.params?.[0]?.data?.startsWith(toFunctionSelector('delegationOf(address,bytes32)'))){
      const fields=roomsLifecycleHubAbi.find(x=>x.name==='delegationOf')!.outputs[0].components;
      const d:any=Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:/^uint(8|16|32)$/.test(f.type)?0:0n]));
      Object.assign(d,{app,status:1,epoch:1n,expiresAt:BigInt(Math.floor(Date.now()/1000)+7200),batchIndex:1n});
      return reply(encodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:'delegationOf',result:d}));
    }
    return reply(encodeAbiParameters([{type:rpc.params?.[0]?.data===toFunctionSelector('hub()')?'address':'uint256'}],[rpc.params?.[0]?.data===toFunctionSelector('hub()')?manifest.hub as Address:0n]));
   }
   throw Error("Unexpected external request: "+u.hostname);
  });
  await context.routeWebSocket("**/*",()=>{});
  const page=await context.newPage();page.on("pageerror",e=>report.errors.push(e.message));
  page.on('requestfailed',r=>console.log('request failed',r.url().split('?')[0],r.failure()?.errorText));
  page.on('console',m=>{if(m.type()==='error')console.log('browser error',m.text().slice(0,300));});
  await page.goto(origin+"/rooms",{waitUntil:'domcontentloaded',timeout:90000});
  await page.locator(".rooms-court").waitFor({timeout:60000}).catch(async e=>{report.errors.push(await page.locator('body').innerText());console.log(await page.evaluate(()=>({scripts:[...document.scripts].map(s=>s.src),keys:Object.keys(sessionStorage)})));throw e;});
  await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('[aria-label="Move up"]')?.disabled);
  const duplicate=await context.newPage();
  await duplicate.goto(origin+"/rooms");
  await duplicate.getByText("This account is already controlling PONGIT in another tab.",{exact:false}).waitFor();
  await duplicate.close();
  if(failure==='unsent'){
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.rooms-court').waitFor();
    await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('[aria-label="Move up"]')?.disabled);
  }
  const beforeReads=reads,beforeWrites=writes;
  await page.waitForTimeout(2200);
  assert(reads>beforeReads,"coordinator offline must not freeze direct engine observation");
  failNext=true;
  const result=page.getByRole("dialog",{name:failure==='cancelled'?"Cancelled match result":"Confirmed match result"});
  await result.waitFor({timeout:22000});
  if(failure==='cancelled'){
    assert.equal(await result.locator('h2').textContent(),'Match cancelled');
    await result.getByText('No winner. ELO unchanged.',{exact:true}).waitFor();
    assert.equal(await result.getByText('DEFEAT',{exact:true}).count(),0);
  }else{
    assert.equal(await result.locator("h2").textContent(),"VICTORY");
    assert.equal(await result.locator(".outcome-score").textContent(),"7 : 6");
    await page.getByText("Classic ELO +16",{exact:true}).waitFor();
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Result must not introduce horizontal page scrolling');
  assert.equal(await page.getByRole("button",{name:"Reconnect",exact:true}).count(),0);
  assert.equal(await page.getByText("The engine did not confirm this action.",{exact:false}).count(),0);
  assert(recoveredAt-limitedAt>=9500,"Retry-After must be honored before the next network read");
  await page.screenshot({path:`${out}/${failure}-result.png`});
  await page.getByRole("button",{name:"Close result",exact:true}).click();
  acceptNext=true;
  await page.getByRole("button",{name:/^(Accept|Retry acceptance)$/}).click();
  await page.locator(".rooms-court").waitFor({timeout:10000}).catch(async e=>{
    report.errors.push(await page.locator("body").innerText());
    await page.screenshot({path:`${out}/${failure}-next-match-failure.png`});throw e;
  });
  await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('[aria-label="Move up"]')?.disabled);
  if(failure==="uncertain")assert(nonceReads>=2,"next acceptance restores the SDK nonce without another passkey");
  report.scenarios.push({failure,viewport,reads,writes,idleWrites:writes-beforeWrites,cooldownMs:recoveredAt-limitedAt,finalScore:failure==='cancelled'?'cancelled':'7:6',nextMatch:true,nonceReads});
  await context.close();
 }
 report.checks.push("Offline coordinator does not freeze a healthy direct engine lane","Final-tick revert plus 429 recovers the result without reconnecting","Unknown submission stops writes but preserves result transition","Room rotates to a new invitation before the previous result is recovered","Next match refreshes an uncertain SDK nonce without a passkey ceremony","The current tab can restore its session; a second controlling tab is still rejected","Ten-second shared cooldown honored","Exact per-match ELO displayed after fresh read","Desktop and mobile result visible","Cancellation opens an accessible neutral result without a false winner or defeat");
 assert.deepEqual(report.errors,[]);
}finally{
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();
 if(!process.env.ROOMS_BROWSER_ASSETS)await writeFile(`${out}/frontend-assets.json`,JSON.stringify(assets));
}
