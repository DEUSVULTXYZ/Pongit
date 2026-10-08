// Playwright normally forces visibility even when a real tab is hidden.
// Use its documented noDefaults CDP attachment for this fault only.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,type Browser,type BrowserContext,type Page} from '@playwright/test';

export async function realBackgroundBrowser(channel:string,profile:string,storage:Awaited<ReturnType<BrowserContext['storageState']>>|undefined){
 assert(profile.includes('/private-backups/')&&profile.endsWith('-profile'));
 await mkdir(profile); // Never reuse a profile or a user's ordinary browser.
 const executable=channel==='msedge'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'C:/Program Files/Google/Chrome/Application/chrome.exe';
 const child=spawn(executable,['--user-data-dir='+profile,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--window-size=1480,980','about:blank'],{stdio:'ignore'});
 let browser:Browser|undefined;
 try{
  let port='';
  for(let i=0;i<100&&!port;i++){
   try{port=(await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0];}
   catch{await new Promise(r=>setTimeout(r,100));}
  }
  assert(/^\d+$/.test(port),'Owned browser debugging endpoint unavailable');
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{noDefaults:true});
  const context=browser.contexts()[0];assert(context);
  if(storage){
   await context.addCookies(storage.cookies);
   await context.addInitScript(origins=>{
    for(const origin of origins)if(location.origin===origin.origin)
     for(const item of origin.localStorage)localStorage.setItem(item.name,item.value);
   },storage.origins);
  }
  return {browser,context,child};
 }catch(error){await browser?.close().catch(()=>{});child.kill();throw error;}
}

export async function recordBackgroundPage(page:Page,output:string){
 const directory=output+'/background-video';await mkdir(directory);
 const session=await page.context().newCDPSession(page);
 const rows:Array<{name:string;at:number}>=[];let pending=Promise.resolve();
 session.on('Page.screencastFrame',frame=>{
  const row={name:String(rows.length).padStart(6,'0')+'.jpg',at:Date.now()};rows.push(row);
  pending=pending.then(()=>writeFile(directory+'/'+row.name,Buffer.from(frame.data,'base64')));
  void session.send('Page.screencastFrameAck',{sessionId:frame.sessionId}).catch(()=>{});
 });
 await session.send('Page.startScreencast',{format:'jpeg',quality:45,maxWidth:960,maxHeight:650,everyNthFrame:4});
 return async()=>{
  await session.send('Page.stopScreencast');await pending;
  assert(rows.length>1,'No actual browser video frames');
  await writeFile(directory+'/frames.json',JSON.stringify(rows));
  const concat=rows.map((r,i)=>`file '${r.name}'\nduration ${Math.max(.001,((rows[i+1]?.at??r.at+100)-r.at)/1000)}`).join('\n')+`\nfile '${rows.at(-1)!.name}'\n`;
  await writeFile(directory+'/frames.txt',concat);
  const encoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','concat','-safe','0','-i','frames.txt','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','player.mp4'],{cwd:directory,encoding:'utf8',timeout:60000,windowsHide:true});
  assert.equal(encoded.status,0,'Actual browser video encoding failed');
  return directory+'/player.mp4';
 };
}
