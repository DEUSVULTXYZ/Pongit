// Production HTML captured from the isolated VPS and fulfilled in the browser.
// All API and engine responses are synthetic fixtures. No passkeys or writes.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {extname,resolve,relative} from 'node:path';
import {chromium} from '@playwright/test';
import {decodeFunctionData,encodeFunctionResult,zeroAddress,zeroHash,type Address} from 'viem';
import {pooledAgentArenaAbi as abi} from '../shared/abi-PooledAgentArena';
import {pooledHouseBots,type AgentPoolManifest,type TournamentView,type PoolMatchView} from '../shared/agent-pool';
import {initial} from '../shared/physics-v2';
import {chaosBrowserPayload} from './chaos-browser-fixture';
assert.equal(process.env.PONG_POOL_UI_TEST,'isolated-fixture');
const origin='http://127.0.0.1:4189',channel=process.env.BROWSER_CHANNEL??'chrome';
const series=process.env.PONG_POOL_UI_RULES==='11';assert(!process.env.PONG_POOL_UI_RULES||['10','11'].includes(process.env.PONG_POOL_UI_RULES));
const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const node=JSON.parse(await readFile('deployments/agents.json','utf8')).node;
const people=pooledHouseBots.map((b,i)=>({agent:address(100+i),name:b.name,avatar:b.avatar,official:true,creator:address(90),difficulty:b.difficulty,modes:[0,1],qualification:{0:true,1:true},available:true,waiting:false}));
const m:AgentPoolManifest={version:series?3:2,chainId:10143,engineChainId:4242,rulesVersion:series?11:10,hub:address(1),pool:address(2),catalog:address(3),tournaments:address(4),ratings:address(5),challenges:address(6),qualifications:address(7),family:address(8),
 arenas:[9,10,11].map(n=>({app:address(n),node,runtimeHash:zeroHash})),enabled:true,tournamentsEnabled:true,verifiedCapacity:2,qualificationEvidence:`0x${'b'.repeat(64)}`,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
const ref={chainId:10143 as const,app:address(9),epoch:'1',id:'1'};
const observation={block:'50',hash:zeroHash,timestamp:String(Math.floor(Date.now()/1000)),revision:'fixture'};
const tournament=(id:string,league:boolean,mode:0|1):TournamentView=>({id,mode,format:league?'championship':'elimination',status:'playing',revision:1,startedAt:observation.timestamp,completedAt:null,champion:zeroAddress,
 entrants:people.map(p=>({agent:p.agent,controllerHash:zeroHash,initialElo:1000})),
 fixtures:Array.from({length:league?28:7},(_,i)=>({index:i,ref:i===0?ref:null,a:people[i%8].agent,b:people[(i+1)%8].agent,advanced:zeroAddress,resolved:false,administrative:false,attempt:i===0?1:0,result:null})),
 standings:people.map((p,i)=>({agent:p.agent,points:21-i*3,difference:14-i*2,wins:7-i,initialElo:1000})),observedBlock:'50',published:true,nextAt:null});
const report:any={at:new Date().toISOString(),channel,scope:'Captured isolated VPS production build; synthetic API/engine; no authentication or hosted gameplay qualification',checks:[],errors:[]};
const mime:Record<string,string>={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
await mkdir('artifacts/qualification/20260919/pool-ui',{recursive:true});
const browser=await chromium.launch({channel,headless:true});
try{
 for(const [width,height] of [[360,640],[390,844],[768,900],[1440,1000],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:width===390?'reduce':'no-preference'});
  let mode:0|1=0,league=false,published=false,effect=21,revision=1n;
  await context.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'})));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   try{
    if(url.origin===origin){
     if(request.headers().rsc==='1')return route.fulfill({status:404,body:''});
     const pathname=decodeURIComponent(url.pathname);
     let root:string,file:string;
     if(pathname==='/agents'||pathname==='/agents/tournaments'||pathname.startsWith('/agents/arenas/')){root=resolve('artifacts/qualification/20260919/pool-ui');file=resolve(root,pathname==='/agents'?'catalog.html':pathname==='/agents/tournaments'?'tournaments.html':'arena.html');}
     else if(pathname.startsWith('/_next/static/')){root=resolve('web/.next/static');file=resolve(root,pathname.slice('/_next/static/'.length));}
     else if(pathname==='/icon.svg'||pathname==='/icon.png'){root=resolve('web/app');file=resolve(root,pathname.slice(1));}
     else{root=resolve('web/public');file=resolve(root,pathname.slice(1));}
     assert(!relative(root,file).startsWith('..'));
     return route.fulfill({body:await readFile(file),contentType:mime[extname(file)]??'application/octet-stream'});
    }
    if(url.origin==='http://localhost:4000'){
     let data:any;
     if(url.pathname==='/agents/config')data=m;
     else if(url.pathname==='/agents/catalog')data={items:people,total:'8',offset:'0',next:null};
     else if(url.pathname==='/agents/live')data={items:[{ref,a:people[0].agent,b:people[1].agent,mode:0,lane:'tournament'}]};
     else if(url.pathname==='/agents/tournaments')data={items:[tournament('1',league,mode)],total:'1',offset:'0',next:null,nextAt:'0'};
     else if(url.pathname==='/agents/tournaments/1')data=tournament('1',league,mode);
     else if(url.pathname.startsWith('/agents/matches/'))data={ref,a:people[0].agent,b:people[1].agent,mode,ranked:false,tournament:'1',lane:0,node:published?null:node,currentBinding:!published,regulationSeconds:300,overtimeSeconds:league?0:60,
      result:published?{hash:zeroHash,winner:people[0].agent,status:3,scoreA:7,scoreB:2,elapsedUs:'60000000',finality:true}:null} satisfies PoolMatchView;
     else throw Error('Unexpected fixture API '+url.pathname);
     return route.fulfill({json:{...data,observation}});
    }
    if(url.origin===node){
     const rpc=request.postDataJSON(),reply=(result:any)=>route.fulfill({json:{jsonrpc:'2.0',id:rpc.id,result}});
     if(rpc.method==='interlude_session')return reply({app:ref.app,chainId:4242,epoch:1,ephemeralBlock:100,execTimestamp:Math.floor(Date.now()/1000),pendingDiffs:[]});
     if(rpc.method==='eth_call'){
      const call=decodeFunctionData({abi,data:rpc.params[0].data});
      if(call.functionName==='RULES_VERSION')return reply(encodeFunctionResult({abi,functionName:'RULES_VERSION',result:BigInt(m.rulesVersion)}));
      assert.equal(call.functionName,'chaosState');
      const state={...initial(zeroHash,mode),t:3000000n,scoreA:3,scoreB:2};
      const header=[1n,revision,2n,people[0].agent,people[1].agent,zeroAddress,zeroAddress,100n+revision,state.t,0n,0n,0n,state];
      return reply(encodeFunctionResult({abi,functionName:'chaosState',result:chaosBrowserPayload(abi,header,mode?effect:0,mode?13:0)}));
     }
     throw Error('Unexpected engine request '+rpc.method);
    }
    throw Error('Unexpected external origin '+url.origin);
   }catch(e){report.errors.push((e as Error).message);await route.abort();}
  });
  await context.routeWebSocket('**/*',route=>{route.onMessage(raw=>{const r=JSON.parse(String(raw));route.send(JSON.stringify({jsonrpc:'2.0',id:r.id,result:'fixture-applied'}));});});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(origin+'/agents');await page.getByRole('heading',{name:'Agent Arcade',exact:true}).waitFor();
  await page.getByRole('button',{name:'Challenge NOVA',exact:true}).waitFor();assert.equal(await page.locator('.agent-card').count(),8);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'catalogue page overflow');
  const docs=await page.getByRole('link',{name:'Docs ↗',exact:true}).boundingBox(),back=await page.getByRole('link',{name:'Back to arcade',exact:true}).boundingBox();
  assert(docs&&back&&(docs.x+docs.width<=back.x||back.x+back.width<=docs.x||docs.y+docs.height<=back.y||back.y+back.height<=docs.y),'Header links overlap');
  await page.getByRole('button',{name:'Challenge NOVA',exact:true}).click();await page.getByRole('dialog',{name:'Connect to challenge an agent'}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator(':focus').textContent(),'Challenge NOVA');
  await page.getByRole('button',{name:'Chaos',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Chaos',exact:true}).getAttribute('aria-pressed'),'true');
  await page.screenshot({path:`artifacts/qualification/20260919/pool-ui/${channel}-catalogue-${width}.png`,fullPage:true});
  report.checks.push({width,height,catalogue:true,eightBots:true,connectIntent:true,escape:true,focusRestored:true});
  for(league of [false,true]){
   mode=league?1:0;await page.goto(origin+'/agents/tournaments?id=1');await page.getByRole('heading',{name:'Tournament #1',exact:true}).waitFor();
   assert.equal(await page.locator('.tournament-fixture').count(),league?28:7);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'tournament page overflow');
   await page.getByRole('button',{name:/#1/}).click();await page.waitForFunction(()=>document.activeElement?.textContent==='Tournament #1');
   await page.screenshot({path:`artifacts/qualification/20260919/pool-ui/${channel}-${league?'championship':'elimination'}-${width}.png`,fullPage:true});
   report.checks.push({width,height,format:league?'championship':'elimination',layout:true,focus:true});
  }
  for(mode of [0,1] as const){
   published=false;effect=21;revision=1n;
   await page.goto(`${origin}/agents/arenas/${ref.app}/1/1`);await page.locator('canvas').waitFor();
   const before=await page.locator('canvas').boundingBox();assert(before&&Math.abs(before.width/before.height-16/9)<.03);
   assert(before.height>80&&before.y+before.height<=height,'The complete court must fit the viewport');
   if(mode){effect=23;revision++;await page.waitForTimeout(1100);const after=await page.locator('canvas').boundingBox();assert(after&&Math.abs(before.y-after.y)<1,'Effect shifted the court');}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'arena page overflow');
   await page.screenshot({path:`artifacts/qualification/20260919/pool-ui/${channel}-${mode?'chaos':'classic'}-${width}.png`,fullPage:true});
   published=true;await page.getByRole('heading',{name:'NOVA wins',exact:true}).waitFor({timeout:16000});
   assert.equal(await page.locator('canvas').count(),0);assert(await page.getByText('Final published result',{exact:true}).isVisible());
   report.checks.push({width,height,mode,pixelCourt:true,noEffectShift:true,publishedResult:true});
  }
  await context.close();
 }
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.error=(e as Error).message;process.exitCode=1;}
finally{await browser.close();await writeFile(`artifacts/qualification/20260919/pool-ui/${channel}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
