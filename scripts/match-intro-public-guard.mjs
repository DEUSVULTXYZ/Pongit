import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
assert.equal(process.env.INTRO_LIVE_TEST,'authorized-testnet');
const players=JSON.parse(await readFile('/secrets/intro-live.json','utf8')).slice(0,2),[a,b]=players;
const origin='https://pongit.xyz';
async function request(p,path,body){const r=await fetch(origin+'/api/interlude/'+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',cookie:p.cookie,'x-pongit-player':p.address},body:body===undefined?undefined:JSON.stringify({...body,operation:crypto.randomUUID()}),signal:AbortSignal.timeout(15000)});return {status:r.status,...await r.json()};}
const report={at:new Date().toISOString(),scope:'Production API with unfunded fixture identities; no engine transaction'};
try{
 const r=await request(a,'rooms',{mode:0,players:[b.address]});assert.equal(r.status,200);
 assert.equal((await request(b,'rooms/join',{room:r.room})).status,200);
 let offer;for(let i=0;i<40&&!offer;i++){offer=(await request(a,'state')).room?.offer;if(!offer)await new Promise(r=>setTimeout(r,500));}
 assert(offer,'Expected a fixture invitation');
 const old=await request(a,'offers/accept',{id:offer.id});assert.equal(old.status,400);assert.match(old.error,/Refresh PONGIT/);
 const missing=await request(a,'offers/accept',{id:offer.id,countdown:true});assert.equal(missing.status,400);assert.match(missing.error,/countdown/);
 report.oldTabRejected=true;report.missingIntroRejected=true;
 report.passed=true;
}finally{
 for(const p of players){const r=await request(p,'rooms/leave',{});assert.equal(r.status,200,'Release test participation');}
 await writeFile('artifacts/intro/public-guard.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
