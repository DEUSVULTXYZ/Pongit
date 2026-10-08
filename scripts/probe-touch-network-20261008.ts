import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {encodeFunctionData} from 'viem';

// Read-only browser/input isolation. No account, session, signature or game.
const config=await(await fetch('https://pongit.xyz/api/agents/config')).json();
const arena=config.arenas.find((a:any)=>a.app.toLowerCase()==='0x264101ca1936cfd1b274f5ceba535e1378597dc4');
assert(arena);
const data=encodeFunctionData({abi:[{type:'function',name:'RULES_VERSION',inputs:[],outputs:[{type:'uint256'}],stateMutability:'view'}],functionName:'RULES_VERSION'});
const browser=await chromium.launch({channel:'chrome',headless:false});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const page=await context.newPage(),cdp=await context.newCDPSession(page);
await page.addInitScript('window.__name = value => value');
const rows:any[]=[];
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('https://pongit.xyz/agents',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(2000);
 await page.evaluate(async({arena,data})=>{
  const button=document.createElement('button');button.id='touch-network-probe';button.textContent='Read-only touch probe';
  button.style.cssText='position:fixed;top:250px;left:40px;width:300px;height:100px;z-index:2147483647;touch-action:none';document.body.append(button);
  const ws=new WebSocket(arena.node.replace('https:','wss:'));await new Promise<void>((r,j)=>{ws.onopen=()=>r();ws.onerror=()=>j(Error('probe socket'));});
  const pending=new Map<number,{at:number;mode:string}>();let id=0;
  const root=window as any;root.__touchProbe={mode:'pointer',rows:[]};
  ws.onmessage=e=>{const reply=JSON.parse(e.data),p=pending.get(reply.id);if(!p)return;pending.delete(reply.id);root.__touchProbe.rows.push({...p,transport:'ws',ms:performance.now()-p.at,valid:!reply.error&&BigInt(reply.result)===17n});};
  const read=()=>{const mode=root.__touchProbe.mode,at=performance.now(),body={jsonrpc:'2.0',id:++id,method:'eth_call',params:[{to:arena.app,data},'latest']};
   pending.set(id,{at,mode});ws.send(JSON.stringify(body));
   void fetch(arena.node,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,id:++id})}).then(r=>r.json()).then(reply=>root.__touchProbe.rows.push({at,mode,transport:'http',ms:performance.now()-at,valid:!reply.error&&BigInt(reply.result)===17n}));
  };
  button.addEventListener('pointerdown',e=>{if(root.__touchProbe.mode==='cancel-pointer')e.preventDefault();if(root.__touchProbe.mode!=='keyboard')read();});
  button.addEventListener('touchstart',e=>{if(root.__touchProbe.mode==='cancel-touch')e.preventDefault();},{passive:false});
  button.addEventListener('keydown',e=>{if(e.key==='q')read();});
 },{arena,data});
 for(const mode of ['pointer','cancel-pointer','cancel-touch']){
  await page.evaluate(m=>(window as any).__touchProbe.mode=m,mode);
  for(let i=0;i<12;i++){
   if(mode==='keyboard'){await page.locator('#touch-network-probe').focus();await page.keyboard.down('q');await page.waitForTimeout(80);await page.keyboard.up('q');}
   else{const b=(await page.locator('#touch-network-probe').boundingBox())!;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});await page.waitForTimeout(80);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   await page.waitForTimeout(250);
  }
 }
 await page.waitForTimeout(1500);rows.push(...await page.evaluate(()=>(window as any).__touchProbe.rows));
 console.log(JSON.stringify({samples:rows.length,errors}));
 await writeFile('artifacts/responsive-20261008-r2/touch-network-probe-3.json',JSON.stringify({at:new Date().toISOString(),arena:arena.app,passed:rows.length===72&&rows.every(r=>r.valid),scope:'Visible Chrome CDP touch; read-only RULES_VERSION, no game writes. Diagnostic fixture overlay, not gameplay proof.',rows},null,2)+'\n',{flag:'wx'});
 for(const mode of ['pointer','cancel-pointer','cancel-touch'])for(const transport of ['ws','http']){const ms=rows.filter(r=>r.mode===mode&&r.transport===transport).map(r=>r.ms).sort((a,b)=>a-b);console.log(JSON.stringify({mode,transport,samples:ms.length,p50:ms[6],p95:ms[11]}));}
 assert.equal(rows.length,72);assert(rows.every(r=>r.valid));
}finally{await browser.close();}
