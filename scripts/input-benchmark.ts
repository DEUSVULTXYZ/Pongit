import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {keccak256,type Hex} from "viem";
import {domain,joinV2Types,inputTypes,actionTypes,json} from "../shared/protocol";
import {intentMessage,intentTypes} from "../shared/input-transport";
import {InputController} from "../web/lib/input-controller";

// Uses real signed consent and the browser input controller. It never receives
// the operator key and never sends a financial transaction directly.
const base=process.env.E2E_API_URL||"http://localhost:3150/api";
const origin=process.env.E2E_WEB_URL||new URL(base).origin;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function api(path:string,body?:unknown,headers:Record<string,string>={}) {
 const r=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{"content-type":"application/json",...headers},body:body===undefined?undefined:json(body),signal:AbortSignal.timeout(15000)});
 const v=await r.json();if(!r.ok||v.error&&!path.startsWith("/jobs/"))throw new Error(v.error||`HTTP ${r.status}`);return v;
}
async function until<T>(read:()=>Promise<T>,done:(v:T)=>boolean,ms=60000){const end=Date.now()+ms;while(Date.now()<end){const v=await read();if(done(v))return v;await sleep(200);}throw new Error("Benchmark condition timed out");}
async function waitJob(id:string){const j=await until(()=>api(`/jobs/${id}`),j=>["succeeded","superseded","failed"].includes(j.status));if(j.status==="failed")throw new Error(j.error||"Input failed");return j;}
async function relay(functionName:string,args:unknown[]){const j=await api("/relay",{contract:"game",functionName,args});return waitJob(j.id);}
const config=await api("/config");assert([10143,31337].includes(config.chainId));
if(config.chainId===10143)assert.equal(process.env.E2E_ALLOW_TESTNET,"true","Explicit testnet benchmark required");
assert.equal(config.version,4,"This benchmark targets the unchanged V4 game");
type Player=ReturnType<typeof privateKeyToAccount>;
const cookies=new Map<string,string>();
async function social(p:Player,path:string,body:unknown){const r=await fetch(base+path,{method:"POST",headers:{origin,"content-type":"application/json","x-pongit-player":p.address,cookie:cookies.get(p.address)||""},body:json(body)});const cookie=r.headers.get("set-cookie");if(cookie)cookies.set(p.address,cookie.split(";")[0]);const v=await r.json();assert(r.ok&&!v.error,json(v));return v;}
async function pair(){
 const players=[privateKeyToAccount(generatePrivateKey()),privateKeyToAccount(generatePrivateKey())],keys=players.map(()=>privateKeyToAccount(generatePrivateKey())),secrets=players.map(()=>generatePrivateKey());
 for(const p of players){const c=await social(p,"/auth/challenge",{player:p.address});await social(p,"/auth/session",{player:p.address,nonce:c.nonce,signature:await p.signMessage({message:c.message})});}
 const invite=await social(players[0],"/challenges",{recipient:players[1].address,mode:0,ranked:false});await social(players[1],`/challenges/${invite.id}/accept`,{});
 const room=await until(()=>api(`/queue/${players[0].address}`),r=>!!r.id);
 for(let i=0;i<2;i++){const p=players[i],info=await api(`/player/${p.address}`),now=Math.floor(Date.now()/1000);const join={player:p.address,opponent:players[1-i].address,roomId:room.id as Hex,commitment:keccak256(secrets[i]),sessionKey:keys[i].address,nonce:BigInt(info.gameNonce),deadline:BigInt(now+150),sessionExpiry:BigInt(now+600),maxInputs:12000,tournamentId:0n,mode:0,ranked:false,rulesVersion:2};await api("/ready",{join,signature:await p.signTypedData({domain:domain("PONG",config.chainId,config.game),types:joinV2Types,primaryType:"Join",message:join})});}
 const ready=await until(()=>api(`/queue/${players[0].address}`),r=>!!r.match_id),id=ready.match_id;
 await Promise.all(players.map((p,i)=>relay("reveal",[id,p.address,secrets[i]])));
 await until(()=>api(`/matches/${id}`),v=>v.match.status===2);return {players,keys,id};
}
const q=(values:number[])=>{const s=values.filter(Number.isFinite).sort((a,b)=>a-b);return {n:s.length,p50:s[Math.ceil(s.length*.5)-1]??null,p95:s[Math.ceil(s.length*.95)-1]??null,p99:s[Math.ceil(s.length*.99)-1]??null};};
const phases:any[]=[];
for(const arenaCount of [1,4]){
 const games=await Promise.all(Array.from({length:arenaCount},()=>pair())),accepted:any[]=[],confirmed:any[]=[],errors:string[]=[],acks:number[]=[],intentions:any[]=[];
 let snapshot=await api("/matches"),refreshing=false;const starts=performance.now();
 const controllers=games.flatMap(g=>g.players.map((p,i)=>{
   let sent:any;
   const controller=new InputController({state:()=>api(`/inputs/${g.id}/${p.address}`),post:async body=>{sent=(body as any).request.args[0];const r=await api("/inputs",body);if(r.accepted)accepted.push({id:r.id,matchId:g.id,player:p.address,direction:sent.direction,nonce:String(sent.nonce),atMs:performance.now()-starts});return r;},wait:waitJob,pending:()=>{},ack:ms=>acks.push(ms),confirmed:(job,ms)=>confirmed.push({id:job.id,hash:job.tx_hash,timing:job.timing,observedMs:ms}),error:e=>errors.push(e)});
   return {g,p,i,controller};
 }));
 const refresh=setInterval(()=>{if(refreshing)return;refreshing=true;void api("/matches").then(v=>snapshot=v).catch(e=>errors.push(e.message)).finally(()=>refreshing=false);},250);
 const interval=arenaCount===1?300:450;
 const contexts=new Map<string,Parameters<InputController["update"]>[0]>();
 const tick=setInterval(()=>{for(const {g,p,i,controller} of controllers){
  const m=snapshot.matches.find((m:any)=>m.id===g.id);if(!m||m.status!==2){controller.update(null);continue;}
  const step=Math.floor((performance.now()-starts+i*80)/interval),direction=[-1,0,1,0][step%4];
  const context:NonNullable<Parameters<InputController["update"]>[0]>={key:`${g.id}:${p.address}`,direction,head:BigInt(snapshot.head),sign:async(nonce,sequence,direction,head)=>{
   const input={matchId:BigInt(g.id),player:p.address,direction,nonce,observedBlock:head,validUntilBlock:head+16n};
   intentions.push({matchId:g.id,player:p.address,direction,nonce:String(nonce),atMs:performance.now()-starts});const key=g.keys[i];
   return {request:{contract:"game",functionName:"submitInput",args:[input,await key.signTypedData({domain:domain("PONG",config.chainId,config.game),types:inputTypes,primaryType:"Input",message:input})]},intent:{sequence,signature:await key.signTypedData({domain:domain("PONGIT Input Transport",config.chainId,config.game),types:intentTypes,primaryType:"InputIntent",message:intentMessage(input,sequence,config.chainId,config.game)})}};
  }};
  contexts.set(p.address,context);controller.update(context);
 }},16);
 await sleep(arenaCount===1?22000:18000);clearInterval(tick);clearInterval(refresh);
 // Submit the release independently of outstanding receipts, then let the
 // persistent worker finish before checking nonce and transaction identities.
 for(const {g,p,controller} of controllers){const m=await api(`/matches/${g.id}`);if(m.match.status!==2){controller.reset();continue;}const context=contexts.get(p.address);if(context){for(let n=0;n<30;n++){controller.update({...context,direction:0,head:BigInt(m.head)});await sleep(20);}}}
 await sleep(6000);for(const c of controllers)c.controller.reset();
 const jobs=await Promise.all([...new Set(accepted.map(v=>v.id))].map(id=>api(`/jobs/${id}`)));
 const succeeded=jobs.filter(j=>j.status==="succeeded"),hashes=succeeded.map(j=>j.tx_hash);assert.equal(new Set(hashes).size,hashes.length,"No transaction may execute twice");
 for(const g of games){const r=await api(`/matches/${g.id}`);for(const [index,p] of g.players.entries()){const slot=r.match.playerA.toLowerCase()===p.address.toLowerCase()?r.match.a:r.match.b;const ns=[...new Set(accepted.filter(a=>a.matchId===g.id&&a.player===p.address&&succeeded.some(j=>j.id===a.id)).map(a=>Number(a.nonce)))].sort((a,b)=>a-b);assert(ns.every((n,i)=>n===i+1),"No confirmed input nonce gaps");assert.equal(Number(slot.nonce),ns.length);}
  if(r.match.status===2){const p=g.players[0],info=await api(`/player/${p.address}`),m={player:p.address,matchId:BigInt(g.id),action:2,nonce:BigInt(info.gameNonce),deadline:BigInt(Math.floor(Date.now()/1000)+120)};await relay("playerAction",[m.player,m.matchId,m.action,m.nonce,m.deadline,await p.signTypedData({domain:domain("PONG",config.chainId,config.game),types:actionTypes,primaryType:"GameAction",message:m})]);}
 }
 const phase={arenaCount,matchRefs:games.map(g=>`v4:${g.id}`),durationMs:performance.now()-starts,intentions:intentions.length,accepted:accepted.length,statuses:Object.fromEntries(["succeeded","superseded","failed","sent","queued"].map(s=>[s,jobs.filter(j=>j.status===s).length])),latencyMs:{serverAck:q(acks),queue:q(succeeded.map(j=>j.timing.queueMs)),broadcast:q(succeeded.map(j=>j.timing.broadcastMs)),confirmation:q(succeeded.map(j=>j.timing.confirmationMs)),total:q(succeeded.map(j=>j.timing.totalMs))},errors,commands:accepted,jobs};
 phases.push(phase);console.log(json({...phase,commands:undefined,jobs:undefined}));
}
await mkdir("artifacts",{recursive:true});await writeFile(`artifacts/neon-input-${config.chainId}.json`,json({base,chainId:config.chainId,game:config.game,measuredAt:new Date().toISOString(),definition:"Real signed directions through the browser controller. ACK includes HTTP round-trip; queue includes validation and signing; confirmation includes receipt observation. Replaced intentions are counted separately from onchain inputs.",phases}));
assert(phases[0].accepted>=100,"At least 100 accepted changes with two players are required");
