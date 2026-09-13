// Captured private build; every API, session and chain response is simulated.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {chromium} from '@playwright/test';
import {encodeFunctionResult,zeroHash,zeroAddress,toHex} from 'viem';
import {agentArcadeAbi as abi} from '../shared/abi-PongAgentArcade';
import {houseBots} from '../shared/agents';
import {initial} from '../shared/physics-v2';
import {chaosBrowserPayload} from './chaos-browser-fixture';
assert.equal(process.env.PONG_AGENT_UI_TEST,'captured-private-build');
const root=resolve('artifacts/agents/ui'),origin='https://pongit.xyz',app='0x4cecc7fb9f199fbd91dcc4a6e6ea7156e69247d9';
const profiles=houseBots.map((b,i)=>({agent:`0x${String(i+1).repeat(40)}`,creator:`0x${'4'.repeat(40)}`,name:b.name,avatar:b.avatar,kind:'pongit',modes:[0,1],qualification:{0:'qualified',1:'qualified'},available:true,createdAt:new Date().toISOString()}));
const manifest={version:1,chainId:10143,engineChainId:4242,rulesVersion:7,app,hub:`0x${'5'.repeat(40)}`,coordinator:`0x${'6'.repeat(40)}`,node:'https://agents.invalid',epoch:'1',enabled:true,qualified:true,maxMatches:2,durationSeconds:300};
const mime:Record<string,string>={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const channel=process.env.BROWSER_CHANNEL||'chrome',browser=await chromium.launch({channel,headless:true});
const report:any={at:new Date().toISOString(),scope:'Captured private build, simulated APIs and game state',channel,checks:[],errors:[]};
await mkdir('artifacts/agents/browser',{recursive:true});
try{for(const width of [360,390,768,1440]){
 const context=await browser.newContext({viewport:{width,height:width===360?640:900},reducedMotion:width===390?'reduce':'no-preference'});
 await context.addInitScript(()=>localStorage.setItem('pongit:arcade-audio',JSON.stringify({entered:true,enabled:false,music:.2,effects:.6,background:false,intensity:'off'})));
 let mode:0|1=0,phase=2,revision=1n,effect=21;
 await context.route('**/*',async route=>{
  try{const u=new URL(route.request().url());
   if(u.hostname==='localhost'||u.pathname.startsWith('/api/')){
    const p=u.pathname;let data:any={};
    if(p.endsWith('/agents/config'))data=manifest;
    else if(p.endsWith('/catalog'))data={agents:profiles,health:{stage:'online'}};
    else if(p.endsWith('/live'))data={matches:[{id:'1',app,epoch:'1',a:profiles[0].agent,b:profiles[1].agent,mode,ranked:false,status:'active'}]};
    else if(p.includes('/rankings'))data={entries:profiles.map(p=>({...p,live:{elo:1000},published:{elo:1000}}))};
    else if(p.includes('/config'))data={online:true,admission:true,app:'0x78d3341e3452d7ec1add9371de3008639eed8eb0'};
    return route.fulfill({json:data});
   }
   if(u.hostname==='agents.invalid'){
    const rpc=route.request().postDataJSON(),reply=(result:unknown)=>route.fulfill({json:{jsonrpc:'2.0',id:rpc.id,result}});
    if(rpc.method==='interlude_session')return reply({app,chainId:4242,epoch:1,ephemeralBlock:100,execTimestamp:Math.floor(Date.now()/1000),pendingDiffs:[]});
    if(rpc.method==='eth_chainId')return reply(toHex(4242));
    if(rpc.method==='eth_call'){
     const state={...initial(zeroHash,mode),t:10000000n,scoreA:phase===3?7:3,scoreB:2,finished:phase===3};
     const header=[1n,revision,BigInt(phase),profiles[0].agent,profiles[1].agent,zeroAddress,phase===3?profiles[0].agent:zeroAddress,100n+revision,state.t,0n,0n,0n,state];
     return reply(encodeFunctionResult({abi,functionName:'chaosState',result:chaosBrowserPayload(abi,header,mode?effect:0,mode?13:0)}));
    }
    throw Error('Unexpected game RPC '+rpc.method);
   }
   if(u.origin===origin){
    if(u.pathname==='/icon.svg'||u.pathname==='/icon.png')return route.fulfill({body:await readFile(resolve('web/app',u.pathname.slice(1))),contentType:mime[extname(u.pathname)]});
    const path=resolve(root,u.pathname==='/'?'home.html':u.pathname==='/agents'?(u.searchParams.has('match')?(mode?'chaos':'classic'):u.searchParams.get('view')==='watch'?'watch':'agents')+'.html':u.pathname.startsWith('/_next/static/')?'.next/'+u.pathname.slice('/_next/'.length):'public/'+u.pathname.slice(1));
    assert(!relative(root,path).startsWith('..'));return route.fulfill({body:await readFile(path),contentType:mime[extname(path)]||'application/octet-stream'});
   }
   throw Error('Unexpected external request '+u.origin);
  }catch(e){report.errors.push(String((e as Error).message));await route.abort();}
 });
 await context.routeWebSocket('**/*',route=>{route.onMessage(raw=>{const r=JSON.parse(String(raw));route.send(JSON.stringify({jsonrpc:'2.0',id:r.id,result:'mock-applied'}));});});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/agents');await page.getByRole('heading',{name:'NOVA',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Challenge this agent',exact:true}).count(),3);
 await page.getByRole('button',{name:'Challenge this agent',exact:true}).first().click();await page.getByRole('dialog').waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:`artifacts/agents/browser/${channel}-catalog-${width}.png`,fullPage:true});
 for(mode of [0,1] as const){phase=2;revision=1n;
  await page.goto(`${origin}/agents?match=1&app=${app}&epoch=1&view=watch&mode=${mode}`);
  await page.locator('canvas').waitFor();const before=await page.locator('canvas').boundingBox();assert(before&&before.height>100&&Math.abs(before.width/before.height-16/9)<.03);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  if(mode){effect=23;revision++;await page.waitForTimeout(1000);const after=await page.locator('canvas').boundingBox();assert(after&&Math.abs(before.y-after.y)<1,'Chaos effects must not shift the court');}
  await page.screenshot({path:`artifacts/agents/browser/${channel}-${mode?'chaos':'classic'}-${width}.png`,fullPage:true});
  phase=3;revision++;await page.locator('.spectator-result').waitFor({timeout:15000});await page.getByRole('button',{name:'Dismiss winner'}).click();
  report.checks.push({width,mode,canvasRatio:before.width/before.height,dialogAndResult:true});
 }
 await context.close();
}assert.equal(report.errors.length,0);report.passed=true;}catch(e){report.passed=false;report.error=(e as Error).message;process.exitCode=1;}
finally{await browser.close();await writeFile(`artifacts/agents/browser/${channel}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
