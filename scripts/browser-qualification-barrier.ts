// Test orchestration only: prepare real accounts before simultaneous admissions.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
export async function browserQualificationBarrier(run:string){
 const requested=process.env.PONG_BROWSER_BARRIER;if(!requested)return null;
 const root=resolve('artifacts/qualification')+sep,dir=resolve(requested);
 assert(dir.startsWith(root)&&/^[a-z0-9-]+$/.test(run));
 const config=JSON.parse(await readFile(resolve(dir,'barrier.json'),'utf8'));
 assert(config.runs.includes(run)&&Number.isFinite(config.deadline)&&config.deadline>Date.now()&&config.deadline<=Date.now()+20*60_000);
 await writeFile(resolve(dir,run+'.ready.json'),JSON.stringify({run,readyAt:new Date().toISOString()}),{flag:'wx'});
 while(Date.now()<config.deadline){
  let release:any;
  try{release=JSON.parse(await readFile(resolve(dir,config.humanFirst&&/h[cx]$/.test(run)?'release-human.json':'release.json'),'utf8'));}catch(e){if((e as any).code!=='ENOENT')throw e;}
  if(release){assert.equal(release.deadline,config.deadline);assert.equal(release.readyCount,config.runs.length);assert(release.go===true);
   assert(['NOVA','PULSE','ONYX','VECTOR','DRIFT','ECHO','GLITCH','VIPER'].includes(release.bot));return release;}
  await new Promise(r=>setTimeout(r,250));
 }
 throw Error('Original browser admission barrier expired; no match requested');
}
