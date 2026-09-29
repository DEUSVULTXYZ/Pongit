// Production HTML captured from the isolated VPS and fulfilled in the browser.
// All API and engine responses are synthetic fixtures. No passkeys or writes.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {extname,resolve,relative} from 'node:path';
import {chromium} from '@playwright/test';
import {decodeFunctionData,encodeFunctionResult,zeroAddress,zeroHash,type Address} from 'viem';
import {agentPoolArenaAbi} from '../shared/agent-pool-abi';
import {pooledHouseBots,type AgentPoolManifest,type TournamentView,type PoolMatchView} from '../shared/agent-pool';
import {initial} from '../shared/physics-v2';
import {chaosBrowserPayload} from './chaos-browser-fixture';
import {decodeChaosRead} from '../shared/chaos-codec';
import {engineState} from '../shared/engine-stream';
assert.equal(process.env.PONG_POOL_UI_TEST,'isolated-fixture');
const origin=process.env.PONG_POOL_UI_ORIGIN??'http://127.0.0.1:4189',channel=process.env.BROWSER_CHANNEL??'chrome';
assert(new URL(origin).hostname==='127.0.0.1','UI fixtures may only use loopback');
const output=process.env.PONG_POOL_UI_OUTPUT??'artifacts/qualification/20260919/pool-ui';
const rulesVersion=Number(process.env.PONG_POOL_UI_RULES??10);assert(rulesVersion===10||rulesVersion===11||rulesVersion===15);
const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const node=JSON.parse(await readFile('deployments/agents.json','utf8')).node;
const people=pooledHouseBots.map((b,i)=>({agent:address(100+i),name:b.name,avatar:b.avatar,official:true,creator:address(90),difficulty:b.difficulty,modes:[0,1],qualification:{0:true,1:true},available:true,waiting:false,availability:{0:'available',1:'available'}}));
const m:AgentPoolManifest={version:rulesVersion===15?4:rulesVersion===11?3:2,chainId:10143,engineChainId:4242,rulesVersion,hub:address(1),pool:address(2),catalog:address(3),tournaments:address(4),ratings:address(5),challenges:address(6),qualifications:address(7),family:address(8),
 arenas:[9,10,11].map(n=>({app:address(n),node,runtimeHash:zeroHash})),enabled:true,tournamentsEnabled:true,verifiedCapacity:2,qualificationEvidence:`0x${'b'.repeat(64)}`,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
if(process.env.PONG_POOL_UI_LANES==='5'){
 assert.equal(rulesVersion,15);Object.assign(m,{version:5,maxMatches:5,verifiedCapacity:5,lanes:{tournament:1,challenge:4},arenaAdmissions:'verified-epoch-v1',houseInstances:'official-v1',countdownClock:'engine-ticks-v1',arenas:[9,10,11,12,13,14,15].map(n=>({app:address(n),node,runtimeHash:zeroHash}))});
}
const abi=agentPoolArenaAbi(m);
const ref={chainId:10143 as const,app:address(9),epoch:'1',id:'1'};
const observation={block:'50',hash:zeroHash,timestamp:String(Math.floor(Date.now()/1000)),revision:'fixture'};
const tournament=(id:string,league:boolean,mode:0|1):TournamentView=>({id,mode,format:league?'championship':'elimination',status:'playing',revision:1,startedAt:observation.timestamp,completedAt:null,champion:zeroAddress,
 entrants:people.map(p=>({agent:p.agent,controllerHash:zeroHash,initialElo:1000})),
 fixtures:Array.from({length:league?28:7},(_,i)=>({index:i,ref:i===0?ref:null,a:people[i%8].agent,b:people[(i+1)%8].agent,advanced:zeroAddress,resolved:false,administrative:false,attempt:i===0?1:0,result:null})),
 standings:people.map((p,i)=>({agent:p.agent,points:21-i*3,difference:14-i*2,wins:7-i,initialElo:1000})),observedBlock:'50',published:true,nextAt:null});
const report:any={at:new Date().toISOString(),channel,build:process.env.PONG_BROWSER_BUILD??'development',rulesVersion,lanes:m.maxMatches,scope:'Isolated app; synthetic API/engine; no authentication or hosted gameplay qualification',checks:[],errors:[]};
const mime:Record<string,string>={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel,headless:true});
let lastPage:import('@playwright/test').Page|undefined;
try{
 for(const [width,height] of [[360,640],[390,844],[768,900],[1440,1000],[844,390]].filter(([w])=>!process.env.PONG_POOL_UI_WIDTH||w===Number(process.env.PONG_POOL_UI_WIDTH))){
  const touch=width<=390||height<=500;
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,reducedMotion:width===390?'reduce':'no-preference'});
  await context.addInitScript({content:'globalThis.__name=(fn)=>fn;'});
  let mode:0|1=0,league=false,published=false,effect=21,revision=1n,replayRetired=false,engineReads=0,catalogReads=0,closedAdmissions=false;
  let launchStarted=0;
  let releaseCatalog:(()=>void)|undefined,catalogGate:Promise<void>|undefined;
  await context.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'})));
  await context.addInitScript({content:"Object.defineProperty(navigator.credentials,'get',{value:function(){window.fixtureRefusedPasskey=true;return Promise.reject(new Error('Qualification cancelled passkey request'));}});"});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   try{
    if(url.origin===origin){
     if(process.env.PONG_POOL_UI_ORIGIN)return route.continue();
     if(request.headers().rsc==='1')return route.fulfill({status:404,body:''});
     const pathname=decodeURIComponent(url.pathname);
     let root:string,file:string;
     if(pathname==='/agents'||pathname==='/agents/tournaments'||pathname.startsWith('/agents/arenas/')){root=resolve('artifacts/qualification/20260919/pool-ui');file=resolve(root,pathname==='/agents'?'catalog.html':pathname==='/agents/tournaments'?'tournaments.html':'arena.html');}
     else if(pathname.startsWith('/_next/static/')){root=resolve(process.env.PONG_POOL_UI_STATIC??'web/.next/static');file=resolve(root,pathname.slice('/_next/static/'.length));}
     else if(pathname==='/icon.svg'||pathname==='/icon.png'){root=resolve('web/app');file=resolve(root,pathname.slice(1));}
     else{root=resolve('web/public');file=resolve(root,pathname.slice(1));}
     assert(!relative(root,file).startsWith('..'));
     return route.fulfill({body:await readFile(file),contentType:mime[extname(file)]??'application/octet-stream'});
    }
    if(url.origin==='http://localhost:4000'||url.origin==='https://pongit.xyz'&&url.pathname.startsWith('/api/')){
     if(url.pathname.startsWith('/api/'))url.pathname=url.pathname.slice(4);
     let data:any;
     if(url.pathname==='/agents/events')return route.fulfill({status:503,body:'Fixture uses polling'});
     if(url.pathname==='/agents/config')data=closedAdmissions?{...m,enabled:false,tournamentsEnabled:false}:m;
     else if(url.pathname==='/agents/capacity')data={capacity:{known:true,observedAt:Date.now(),admissions:true,readyArenas:4,freeChallengeLanes:4}};
     else if(url.pathname==='/agents/catalog'){catalogReads++;if(catalogGate)await catalogGate;data={items:people,total:'8',offset:'0',next:null};}
     else if(url.pathname==='/agents/live')data={items:[{ref,a:people[0].agent,b:people[1].agent,mode:0,lane:'tournament'}]};
     else if(url.pathname==='/agents/tournaments')data={items:[tournament('1',league,mode)],total:'1',offset:'0',next:null,nextAt:'0'};
     else if(url.pathname==='/agents/tournaments/1')data=tournament('1',league,mode);
     else if(url.pathname==='/agents/replay'){
      assert.equal(url.searchParams.get('app'),ref.app);assert.equal(url.searchParams.get('epoch'),ref.epoch);assert.equal(url.searchParams.get('id'),ref.id);
      const frames=Array.from({length:10},(_,i)=>{
       const state={...initial(zeroHash,mode),t:BigInt(i)*1000000n,scoreA:i===9?7:3,scoreB:2,finished:i===9};
       const header=[1n,BigInt(i+1),i===9?3n:2n,people[0].agent,people[1].agent,zeroAddress,i===9?people[0].agent:zeroAddress,100n+BigInt(i),state.t,0n,0n,0n,state];
       return engineState(decodeChaosRead(abi,chaosBrowserPayload(abi,header,mode?21:0,mode?13:0)));
      });
      data=JSON.parse(JSON.stringify({ref,rulesVersion:m.rulesVersion,availability:replayRetired?'pruned':'partial',frames:replayRetired?[]:frames,frameCount:replayRetired?0:frames.length},(_,v)=>typeof v==='bigint'?String(v):v));
     }
     else if(url.pathname.startsWith('/agents/matches/'))data={ref,a:people[0].agent,b:people[1].agent,mode,ranked:false,tournament:'1',lane:0,node:published?null:node,currentBinding:!published,regulationSeconds:300,overtimeSeconds:league?0:60,
      result:published?{hash:zeroHash,winner:people[0].agent,status:3,scoreA:7,scoreB:2,elapsedUs:'60000000',finality:true}:null} satisfies PoolMatchView;
     else throw Error('Unexpected fixture API '+url.pathname);
     return route.fulfill({json:{...data,observation}});
    }
    if(url.origin===node){
     engineReads++;
     const rpc=request.postDataJSON(),reply=(result:any)=>route.fulfill({json:{jsonrpc:'2.0',id:rpc.id,result}});
     if(rpc.method==='interlude_session')return reply({app:ref.app,chainId:4242,epoch:1,ephemeralBlock:100,execTimestamp:Math.floor(Date.now()/1000),pendingDiffs:[]});
     if(rpc.method==='eth_getBlockByNumber')return reply({number:'0x64',hash:zeroHash,timestamp:`0x${Math.floor(Date.now()/1000).toString(16)}`});
     if(rpc.method==='eth_call'){
      const call=decodeFunctionData({abi,data:rpc.params[0].data});
      if(call.functionName==='RULES_VERSION')return reply(encodeFunctionResult({abi,functionName:'RULES_VERSION',result:BigInt(m.rulesVersion)}));
      if(call.functionName==='launchAt')return reply(encodeFunctionResult({abi,functionName:'launchAt',result:0n}));
     if(call.functionName==='launchClock'){if(launchStarted===-1)launchStarted=Date.now();return reply(encodeFunctionResult({abi,functionName:'launchClock',result:[3000n,BigInt(Math.max(0,Date.now()-launchStarted))]}));}
      assert.equal(call.functionName,'chaosState');
      const state={...initial(zeroHash,mode),t:3000000n,scoreA:3,scoreB:2};
      const header=[1n,revision,(launchStarted===-1||launchStarted&&Date.now()-launchStarted<3000)?1n:2n,people[0].agent,people[1].agent,zeroAddress,zeroAddress,100n+revision,state.t,0n,0n,0n,state];
      return reply(encodeFunctionResult({abi,functionName:'chaosState',result:chaosBrowserPayload(abi,header,mode?effect:0,mode?13:0)}));
     }
     throw Error('Unexpected engine request '+rpc.method);
    }
    throw Error('Unexpected external origin '+url.origin);
   }catch(e){report.errors.push((e as Error).message);await route.abort();}
  });
  await context.routeWebSocket(url=>url.hostname===new URL(node).hostname,route=>{route.onMessage(raw=>{const r=JSON.parse(String(raw));route.send(JSON.stringify({jsonrpc:'2.0',id:r.id,result:'fixture-applied'}));});});
  const page=await context.newPage();lastPage=page;page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
  page.on('requestfailed',r=>{if(r.failure()?.errorText==='net::ERR_ABORTED')report.abortedRequests=(report.abortedRequests??0)+1;else report.errors.push(r.url().replace(/\?.*/, '')+' '+r.failure()?.errorText);});
  await page.goto(origin+'/agents');await page.getByRole('heading',{name:'Agent Arcade',exact:true}).waitFor();
  await page.getByRole('button',{name:'Challenge NOVA',exact:true}).waitFor();assert.equal(await page.locator('.agent-card').count(),8);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'catalogue page overflow');
  assert.equal(await page.locator('.agent-grid').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),width>=1100?4:2);
  const small=await page.locator('.agent-card button').evaluateAll(elements=>elements.filter(el=>{const r=el.getBoundingClientRect();return r.width<44||r.height<44;}).length);assert.equal(small,0,'Every card action meets the touch target');
  const docs=await page.getByRole('link',{name:'Docs ↗',exact:true}).boundingBox(),back=await page.getByRole('link',{name:'Back to arcade',exact:true}).boundingBox();
  assert(docs&&back&&(docs.x+docs.width<=back.x||back.x+back.width<=docs.x||docs.y+docs.height<=back.y||back.y+back.height<=docs.y),'Header links overlap');
  const headerStyle=await page.locator('header.rooms-header').evaluate(el=>({
   radius:getComputedStyle(el).borderRadius,frame:getComputedStyle(el,'::before').borderImageSource,
   height:el.getBoundingClientRect().height,
   controls:Array.from(el.querySelectorAll('button,a:not(.brand)')).filter(e=>e.getBoundingClientRect().width>0).map(e=>({
    width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,radius:getComputedStyle(e).borderRadius,
   })),
  }));
  assert.equal(headerStyle.radius,'0px');assert(headerStyle.frame.includes('frame-violet.svg'));
  assert(headerStyle.controls.every(c=>c.width>=44&&c.height>=44&&c.radius==='0px'),'Pixel header controls must remain square and touch accessible');
  if(width<=390)assert(headerStyle.height<=120,'Mobile header must not consume the playing field');
  report.checks.push({width,pixelHeader:headerStyle});
  const challenge=page.getByRole('button',{name:'Challenge NOVA',exact:true});
  if(touch)await challenge.tap();else await challenge.click();
  await page.getByRole('dialog',{name:'Connect to challenge an agent'}).waitFor();
  if(width===360){
   await page.getByRole('button',{name:'Connect & play',exact:true}).click();
   const actionError=page.getByRole('dialog').getByRole('alert');await actionError.waitFor();
   assert.equal(await page.evaluate(()=>!!(window as any).fixtureRefusedPasskey),true,'Exercise the explicit refusal fixture');
   const originalError=await actionError.innerText();assert.match(originalError,/passkey/i);
   const before=catalogReads,end=Date.now()+15000;
   while(catalogReads===before&&Date.now()<end)await new Promise(r=>setTimeout(r,100));
   assert(catalogReads>before,'A real background catalogue refresh must occur');
   assert.equal(await actionError.innerText(),originalError,'Catalogue refresh erased the action error');
   report.checks.push({width,actionErrorSurvivesCatalogRefresh:true,authentication:'Explicit refusal fixture only'});
  }
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator(':focus').getAttribute('aria-label'),'Challenge NOVA');
  const chaosButton=page.getByRole('button',{name:'Chaos',exact:true});
  if(touch)await chaosButton.tap();else await chaosButton.click();
  assert.equal(await chaosButton.getAttribute('aria-pressed'),'true');
  await page.screenshot({path:`${output}/${channel}-catalogue-${width}.png`,fullPage:true});
  report.checks.push({width,height,catalogue:true,eightBots:true,connectIntent:true,escape:true,focusRestored:true,touchActions:touch});
  for(league of [false,true]){
   mode=league?1:0;await page.goto(origin+'/agents/tournaments?id=1');await page.getByRole('heading',{name:'Tournament #1',exact:true}).waitFor();
   assert.equal(await page.locator('.tournament-fixture').count(),league?28:7);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'tournament page overflow');
   await page.getByText('Tournament history',{exact:true}).click();await page.getByRole('button',{name:/#1/}).click();await page.waitForFunction(()=>document.activeElement?.textContent==='Tournament #1');
   await page.screenshot({path:`${output}/${channel}-${league?'championship':'elimination'}-${width}.png`,fullPage:true});
   report.checks.push({width,height,format:league?'championship':'elimination',layout:true,focus:true});
  }
  if(width===360&&m.countdownClock){
   mode=0;launchStarted=-1;
   await page.goto(`${origin}/agents/arenas/${ref.app}/1/1`);
   for(const digit of ['3','2','1'])await page.locator('.match-countdown-digit').filter({hasText:digit}).waitFor({timeout:5000});
   await page.locator('.match-countdown').waitFor({state:'hidden',timeout:10000});
   report.checks.push({width,countdown:'3,2,1',confirmedEngineClock:true});launchStarted=0;
  }
  for(mode of [0,1] as const){
   closedAdmissions=width===360;
   published=false;effect=21;revision=1n;
   if(width===360&&mode===0)catalogGate=new Promise<void>(resolve=>{releaseCatalog=resolve;});
   await page.goto(`${origin}/agents/arenas/${ref.app}/1/1`);await page.locator('canvas').waitFor({timeout:5000});
   if(catalogGate){
    assert(await page.getByText('CLASSIC · Live',{exact:false}).isVisible(),'A stalled catalogue must not block observation');
    releaseCatalog!();catalogGate=undefined;await page.getByText('NOVA',{exact:true}).waitFor();
    report.checks.push({width,arenaConnectsBeforeCatalog:true});
   }
   const before=await page.locator('canvas').boundingBox();assert(before&&Math.abs(before.width/before.height-16/9)<.03);
   if(!(before.height>80&&before.y+before.height<=height))await page.screenshot({path:`${output}/${channel}-overflow-${width}-${mode}.png`,fullPage:true});
   assert(before.height>80&&before.y+before.height<=height,'The complete court must fit the viewport: '+JSON.stringify({width,height,mode,before}));
   if(mode){effect=23;revision++;await page.waitForTimeout(1100);const after=await page.locator('canvas').boundingBox();assert(after&&Math.abs(before.y-after.y)<1,'Effect shifted the court');}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'arena page overflow');
   const labels=await page.locator('.player-label').evaluateAll(elements=>elements.map(el=>{
    const name=el.querySelector<HTMLElement>(':scope > span:not(.avatar)')!,avatar=el.querySelector<HTMLElement>('.avatar')!;
    const n=name.getBoundingClientRect(),a=avatar.getBoundingClientRect(),p=el.getBoundingClientRect();
    const board=el.parentElement!,score=board.querySelector<HTMLElement>('.arena-score-module')!;
    return{name:name.textContent,width:n.width,scroll:name.scrollWidth,client:name.clientWidth,
     board:board.clientWidth,columns:getComputedStyle(board).gridTemplateColumns,score:score.clientWidth,scoreMin:getComputedStyle(score).minWidth,
     inside:n.left>=p.left-.5&&n.right<=p.right+.5,
     separated:getComputedStyle(avatar).display==='none'||n.right<=a.left||a.right<=n.left};
   }));
   if(!labels.every(v=>v.inside&&v.separated&&v.scroll<=v.client+1))await page.screenshot({path:`${output}/${channel}-names-${width}-${mode}.png`,fullPage:true});
   assert(labels.every(v=>v.inside&&v.separated&&v.scroll<=v.client+1),'Player name overlaps the avatar or is clipped: '+JSON.stringify(labels));
   if(height<=500&&width>height){assert(await page.locator('.pool-compact-clock').isVisible(),'Regulation clock must remain visible in landscape');assert.match(await page.locator('.pool-compact-clock').innerText(),/\d+:\d{2}/);}
   await page.screenshot({path:`${output}/${channel}-${mode?'chaos':'classic'}-${width}.png`,fullPage:true});
   if(touch){
    // Chromium's actual visual viewport zoom, not CSS zoom or an assertion
    // based only on device scale. No claim of physical-device testing.
    const cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});
    assert.equal(await page.evaluate(()=>visualViewport!.scale),2);
    assert.equal(await page.locator('canvas').count(),1);
    await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
    await cdp.detach();
    const afterZoom=await page.locator('canvas').boundingBox();
    assert(afterZoom&&Math.abs(afterZoom.width-before.width)<1&&Math.abs(afterZoom.y-before.y)<1,'Pinch zoom changed the restored court layout');
    report.checks.push({width,height,mode,pinchZoom:2,restored:true});
   }
   published=true;await page.getByRole('heading',{name:'NOVA wins',exact:true}).waitFor({timeout:16000});
   assert.equal(await page.locator('canvas').count(),0);assert(await page.getByText('Final result',{exact:true}).isVisible());
   replayRetired=false;const readsBeforeReplay=engineReads;
   await page.locator('.pool-published-result').getByRole('button',{name:'Watch replay',exact:true}).click();
   const replay=page.getByRole('dialog',{name:'Match replay',exact:true});await replay.locator('canvas').waitFor();
   await replay.getByText('PARTIAL REPLAY · Some snapshots were not recorded',{exact:true}).waitFor();
   assert(await page.evaluate(()=>getComputedStyle(document.body).overflow==='hidden'),'Replay must lock the background');
   await replay.getByRole('button',{name:'Play replay',exact:true}).click();await page.waitForFunction(()=>Number((document.querySelector('[role=dialog] input[type=range]') as HTMLInputElement)?.value)>0);
   await replay.getByRole('button',{name:'Pause',exact:true}).click();assert.equal(engineReads,readsBeforeReplay,'Replay opened a live engine reader');
   await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Match replay'}).count(),0);
   assert.equal(await page.locator(':focus').textContent(),'Watch replay');
   replayRetired=true;await page.locator('.pool-published-result').getByRole('button',{name:'Watch replay',exact:true}).click();
   await page.getByText('Replay retired. The result remains available.',{exact:true}).waitFor();assert.equal(await page.locator('canvas').count(),0);
   await page.keyboard.press('Escape');
   report.checks.push({width,height,mode,pixelCourt:true,noEffectShift:true,publishedResult:true,replayPlayback:true,replayFocus:true,retiredSummary:true,noReplayEngineRequests:true,closedAdmissionsObserved:closedAdmissions});
  }
  await context.close();
 }
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.error=(e as Error).message;report.hidden=await lastPage?.evaluate(()=>document.hidden).catch(()=>null);report.page=await lastPage?.locator('body').innerText().catch(()=>null);await lastPage?.screenshot({path:`${output}/${channel}-failure.png`,fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{await browser.close();await writeFile(`${output}/${channel}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
