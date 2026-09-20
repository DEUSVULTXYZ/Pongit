// Actual private Next build, simulated contracts/API. No external transaction or
// credential request is allowed through this fixture. Hosted tests are separate.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium,type Page} from '@playwright/test';
import {decodeFunctionData,encodeFunctionResult,parseTransaction,keccak256,zeroAddress,zeroHash,toHex,multicall3Abi,type Abi,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {publicIndependentManifest} from '../shared/independent';
import {independentRules} from '../shared/independent-rules';
import {abi as familyAbi} from '../shared/abi-independent-ArcadeFamily';
import {abi as profilesAbi} from '../shared/abi-independent-ProfileRegistry';
import {abi as ratingsAbi} from '../shared/abi-independent-PublishedRatings';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
import {initial} from '../shared/physics-v2';
import {chaosBrowserPayload} from './chaos-browser-fixture';
assert.equal(process.env.PONG_INDEPENDENT_UI_TEST,'isolated-vps');
const origin='https://pongit.xyz',web=process.env.PONG_INDEPENDENT_UI_WEB??'http://independent-events-web:3000',channel=process.env.BROWSER_CHANNEL??'chrome';
assert(['http://independent-events-web:3000','http://independent-web:3000'].includes(web));
const rulesVersion=Number(process.env.PONG_INDEPENDENT_UI_RULES??13);assert([12,13,14].includes(rulesVersion));
const address=(n:number)=>toHex(n,{size:20}) as Address;
const node=JSON.parse(await readFile('deployments/interlude-rooms.json','utf8')).node;
const m=publicIndependentManifest({rulesVersion,chainId:10143,hub:address(1),family:address(2),lobby:address(3),ratings:address(4),settlement:address(5),vault:address(6),market:address(7),profiles:address(8),privateData:address(9),pressureSigner:address(10),resultVerifier:address(14),admissionSigner:address(15),arenas:[11,12,13].map(n=>({app:address(n),node})),genesis:1700000000,createdAt:'2026-09-20T00:00:00Z'});
const rules=independentRules(m),app=m.arenas[0].app,players=[address(20),address(21)];
const report:any={at:new Date().toISOString(),channel,rulesVersion,scope:'Actual isolated VPS build; synthetic chain/API, no real credentials or hosted gameplay',checks:[],errors:[],passed:false};
const run=process.env.PONG_INDEPENDENT_UI_RUN??'2';assert(/^[a-z0-9-]{1,30}$/.test(run));
const out=`/diagnostics/independent-ui/${run}`;await mkdir(out,{recursive:true});
try{await readFile(`${out}/${channel}.json`);throw Error('Preserve the previous report');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const browser=await chromium.launch({headless:true,channel,args:['--no-sandbox']});
let activePage:Page|undefined;
const json=(v:unknown)=>JSON.parse(JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x));
function empty(p:any):any{if(p.type==='tuple')return Object.fromEntries(p.components.map((c:any)=>[c.name,empty(c)]));if(p.type.endsWith('[]'))return [];if(p.type==='address')return zeroAddress;if(p.type==='bool')return false;if(p.type==='string')return '';if(p.type==='bytes32')return zeroHash;if(p.type==='bytes')return '0x';return 0n;}
function struct(abi:Abi,name:string,values:Record<string,unknown>){const fn=abi.find((x:any)=>x.type==='function'&&x.name===name) as any;return {...empty(fn.outputs[0]),...values};}
try{
 for(const [width,height] of [[360,640],[390,844],[768,1000],[1440,1000],[844,390]])for(const mode of [0,1] as const){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:width===390?'reduce':'no-preference'});
  const key=generatePrivateKey(),grant={player:players[0],key:privateKeyToAccount(key).address,issuedAt:BigInt(Math.floor(Date.now()/1000)),expires:BigInt(Math.floor(Date.now()/1000)+7200),revision:0n};
  let phase=1,revision=1n,launch=0,nonce=0,inputNonce=0n,direction=0,effect=0,terminal=false,roomVisible=false;
  let readyMask=rulesVersion>=13?2:3,readyCommands=0,nonceReads=0;
  const receipts=new Map<string,any>(),inputs:number[]=[];
  const binding={id:1n,epoch:1n,room:1n,a:players[0],b:players[1],mode,ranked:false,keyA:grant.key,keyB:address(22),expiresA:grant.expires,expiresB:grant.expires,preparedBlock:90n};
  await context.addInitScript(({family,key})=>{sessionStorage.setItem(key,JSON.stringify(family));localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:true,intensity:'full'}));},{family:json({grant,key,signature:`0x${'11'.repeat(65)}`}),key:`pongit:family:${m.family.toLowerCase()}`});
  const readBase=(to:string,data:`0x${string}`):`0x${string}`=>{
   if(to.toLowerCase()===monadTestnet.contracts.multicall3.address.toLowerCase()){
    const call=decodeFunctionData({abi:multicall3Abi,data});
    if(call.functionName==='getCurrentBlockTimestamp')return encodeFunctionResult({abi:multicall3Abi,functionName:'getCurrentBlockTimestamp',result:BigInt(Math.floor(Date.now()/1000))});
    assert.equal(call.functionName,'aggregate3');
    const calls=call.args![0] as readonly {target:Address;callData:`0x${string}`}[];
    return encodeFunctionResult({abi:multicall3Abi,functionName:'aggregate3',result:calls.map(c=>({success:true,returnData:readBase(c.target,c.callData)}))});
   }
   const abi=to.toLowerCase()===m.lobby.toLowerCase()?rules.lobby:to.toLowerCase()===m.family.toLowerCase()?familyAbi:to.toLowerCase()===m.profiles.toLowerCase()?profilesAbi:to.toLowerCase()===m.ratings.toLowerCase()?ratingsAbi:to.toLowerCase()===m.hub.toLowerCase()?roomsLifecycleHubAbi:rules.arena;
   const call=decodeFunctionData({abi,data}),fn=call.functionName;
   const values:any={occupancy:roomVisible?1n:0n,activeMatchOf:roomVisible?1n:0n,grantOf:grant,room:struct(rules.lobby,'room',{id:1n,host:players[0],mode,ranked:false,proposal:1n,members:players.map((player,i)=>({player,position:BigInt(i+1),joined:grant.issuedAt,away:false}))}),
    invitationPage:[[],0n],proposal:struct(rules.lobby,'proposal',{id:1n,a:players[0],b:players[1],room:1n,mode,status:2,accepted:3,expires:grant.expires}),arenaOf:app,boundMatch:binding,
    profileOf:struct(profilesAbi,'profileOf',{handle:call.args?.[0]===players[1]?'Rival':'Player',avatar:0}),indexOf:0n,delegationOf:struct(roomsLifecycleHubAbi,'delegationOf',{app,status:1,epoch:1n,expiresAt:grant.expires,batchIndex:1n})};
   if(fn==='ticketOf')values.ticketOf=[struct(rules.lobby,'ticketOf',{authority:m.lobby,arena:app,epoch:1n,sequence:1n,matchId:1n,rules:14n}),binding];
   assert(fn in values,`Unexpected base read ${fn}`);return encodeFunctionResult({abi,functionName:fn,result:values[fn]} as any);
  };
  const block=()=>({number:'0x64',hash:zeroHash,parentHash:zeroHash,timestamp:toHex(BigInt(Math.floor(Date.now()/1000))),gasLimit:'0x1c9c380',gasUsed:'0x0',transactions:[],baseFeePerGas:'0x0',difficulty:'0x0',extraData:'0x',logsBloom:'0x',miner:zeroAddress,mixHash:zeroHash,nonce:'0x0000000000000000',receiptsRoot:zeroHash,sha3Uncles:zeroHash,size:'0x0',stateRoot:zeroHash,transactionsRoot:zeroHash,totalDifficulty:'0x0',uncles:[]});
  const rpc=(v:any,isNode:boolean):any=>{
   let result:any;
   if(v.method==='eth_getBlockByNumber')result=block();
   else if(v.method==='eth_blockNumber')result='0x64';
   else if(v.method==='eth_chainId')result=isNode?'0x1092':'0x279f';
   else if(v.method==='eth_getTransactionCount'){nonceReads++;result=toHex(nonce);}
   else if(v.method==='eth_getTransactionReceipt')result=receipts.get(v.params[0])??null;
   else if(v.method==='interlude_session')result={app,chainId:4242,epoch:1,ephemeralBlock:100,execTimestamp:Math.floor(Date.now()/1000),pendingDiffs:[]};
   else if(v.method==='eth_call'&&!isNode)result=readBase(v.params[0].to,v.params[0].data);
   else if(v.method==='eth_call'){
    const call=decodeFunctionData({abi:rules.arena,data:v.params[0].data});
    if(call.functionName==='boundMatch')result=encodeFunctionResult({abi:rules.arena,functionName:'boundMatch',result:binding});
    else if(call.functionName==='launchAt'){if(readyMask===3)launch||=Date.now()+3000;result=encodeFunctionResult({abi:rules.arena,functionName:'launchAt',result:BigInt(Math.ceil(launch/1000))});}
    else if(call.functionName==='readiness')result=encodeFunctionResult({abi:rules.arena,functionName:'readiness',result:[readyMask,grant.issuedAt+30n]} as any);
    else if(call.functionName==='RULES_VERSION')result=encodeFunctionResult({abi:rules.arena,functionName:'RULES_VERSION',result:BigInt(rulesVersion)});
    else{
     assert.equal(call.functionName,'chaosState');if(phase===1&&launch&&Date.now()>=Math.ceil(launch/1000)*1000){phase=2;revision++;}
     const state={...initial(zeroHash,mode),leftDir:direction,t:phase===1?0n:3000000n,scoreA:terminal?7:0,scoreB:terminal?6:0,finished:terminal};
     const h=[1n,revision,BigInt(terminal?3:phase),players[0],players[1],zeroAddress,terminal?players[0]:zeroAddress,100n+revision,state.t,inputNonce,0n,0n,state];
     result=encodeFunctionResult({abi:rules.arena,functionName:'chaosState',result:chaosBrowserPayload(rules.arena,h,mode&&phase===2?effect:0,0)});
    }
   }else if(v.method==='interlude_sendTransaction'){
    const tx=parseTransaction(v.params[0]),hash=keccak256(v.params[0]);if(receipts.has(hash))return {jsonrpc:'2.0',id:v.id,result:receipts.get(hash)};
    assert.equal(tx.nonce,nonce);const c=decodeFunctionData({abi:rules.arena,data:tx.data!});
    if(rulesVersion===14)assert.equal(c.args?.[0],1n,'Every reusable command must bind its epoch');
    if(c.functionName==='confirmReady'){assert.equal(phase,1);assert.equal(readyMask,2);readyMask=3;readyCommands++;}
    else{assert.equal(phase,2,'No movement before contract phase2');
     if(c.functionName==='input'){inputNonce++;assert.equal(c.args![rulesVersion===14?3:2],inputNonce);direction=Number(c.args![rulesVersion===14?2:1]);inputs.push(direction);}
     else assert.equal(c.functionName,'tick');}
    nonce++;revision++;result={status:'0x1',transactionHash:hash,blockHash:zeroHash,logs:[]};receipts.set(hash,result);
   }else throw Error(`Unexpected method ${v.method}`);
   return {jsonrpc:'2.0',id:v.id,result};
  };
  await context.route('**/*',async route=>{try{
   const u=new URL(route.request().url());
   if(u.origin===origin){
    if(u.pathname.startsWith('/api/')){
     const p=u.pathname.slice(4);let body:any;
     if(p==='/independent/config')body={manifest:m,admission:true,arenas:[],sponsor:{online:true}};
     else if(p==='/independent/diagnostics')body={accepted:true};
     else if(p.includes('/recent')||p.includes('/frequent'))body=[];
     else throw Error(`Unexpected API ${p}`);
     return route.fulfill({json:body});
    }
    return route.fulfill({response:await route.fetch({url:web+u.pathname+u.search})});
   }
   assert(u.origin===node||u.origin==='https://testnet-rpc.monad.xyz','Unexpected external destination');
   const v=route.request().postDataJSON();return route.fulfill({json:Array.isArray(v)?v.map(x=>rpc(x,u.origin===node)):rpc(v,u.origin===node)});
  }catch(e){report.errors.push(String((e as Error).message).slice(0,350));await route.abort();}});
  // Disable push to exercise the real polling fallback in this UI fixture.
  await context.routeWebSocket('**/*',r=>r.close());
  const page=await context.newPage();activePage=page;report.current={width,height,mode,inputs};page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin);await page.locator('.rooms-choice').first().waitFor();
  const choices=await page.locator('.rooms-choice').all();assert.equal(choices.length,3);
  if(width===360)for(const c of choices){const b=await c.boundingBox();assert(b&&b.height>=44&&b.y+b.height<=height,'Home choices must fit');}
  roomVisible=true;await page.locator('.match-countdown-digit').waitFor();
  assert.equal(await page.getByRole('button',{name:'Move up',exact:true}).count(),0);
  const digits=new Set<string>();const until=Date.now()+5500;
  while(Date.now()<until&&phase===1){digits.add((await page.locator('.match-countdown-digit').textContent().catch(()=>''))??'');await page.waitForTimeout(120);}
  assert(digits.has('3')&&digits.has('2')&&digits.has('1'),`Countdown digits missing: ${[...digits]}`);
  await page.getByRole('button',{name:'Move up',exact:true}).waitFor();assert.equal(await page.locator('.match-countdown').count(),0);
  await page.waitForFunction(()=>{const b=document.querySelector('button[aria-label="Move up"]') as HTMLButtonElement;return b&&!b.disabled;});
  const canvas=page.locator('canvas').first(),before=await canvas.boundingBox();assert(before&&before.height>70&&Math.abs(before.width/before.height-16/9)<.04);
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(700);await page.keyboard.up('ArrowUp');await page.waitForTimeout(700);assert(inputs.includes(-1)&&inputs.includes(0));
  if(rulesVersion>=13){assert.equal(readyCommands,1,'One loading acknowledgement per player');assert(nonceReads>=2,'Refresh the EVM nonce between readiness and movement');}
  if(mode){effect=21;revision++;await page.getByText('MULTIBALL',{exact:true}).waitFor();effect=13;revision++;await page.getByText('PINBALL',{exact:true}).waitFor();const after=await canvas.boundingBox();assert(after&&Math.abs(after.y-before.y)<1&&Math.abs(after.height-before.height)<1,'Effects shifted the court');}
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflow');
  await page.screenshot({path:`${out}/${channel}-${mode}-${width}.png`,fullPage:true});
  terminal=true;revision++;await page.getByRole('dialog').waitFor();await page.getByText('VICTORY',{exact:true}).waitFor();
  assert(await page.evaluate(()=>getComputedStyle(document.body).overflow==='hidden'),'Result must lock background');
  report.checks.push({width,height,mode,countdown:[...digits],readyCommands,nonceReads,inputRelease:true,aspect:before.width/before.height,effectsStable:!!mode,result:true});
  await context.close();
 }
 assert.equal(report.errors.length,0,JSON.stringify(report.errors.slice(0,8)));report.passed=true;
}catch(e){report.failure=(e as Error).message;if(activePage&&!activePage.isClosed()){
 report.page=(await activePage.locator('body').innerText()).slice(0,5000);await activePage.screenshot({path:`${out}/${channel}-failure.png`,fullPage:true}).catch(()=>{});
}}finally{await writeFile(`${out}/${channel}.json`,JSON.stringify(report,null,2));await browser.close();}
assert.equal(report.passed,true,report.failure);
