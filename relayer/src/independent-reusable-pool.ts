import {readFile} from 'node:fs/promises';
import {keccak256,type Abi,type Address,type PublicClient} from 'viem';
import type {IndependentManifest} from '../../shared/independent';
import {independentReader} from '../../shared/independent-read';
import {readHubDelegation} from '../../shared/rooms-hub';
import {abi as lobbyAbi} from '../../shared/abi-independent-ReusableEventsLobby';
import {abi as hubAbi} from '../../shared/abi-independent-IInterludeHub';
import {validateReusableBudget,reusableAdmissionBudget,type ReusablePublicationBudget} from './agents/reusable-budget';
import {engineReadRetryMs} from '../../shared/engine-read';
import {DEAD_ARENA_MS,DEAD_ARENA_MIN_EPOCH_SECONDS,replacementBudget} from '../../shared/arena-replacement';

type Queue=(at:Address,abi:Abi,name:string,args:readonly unknown[],value?:bigint,priority?:number)=>Promise<unknown>;
/** Every new hosted epoch needs Interlude's control plane. Any HTTP answer, a 404
 * included, proves it is serving; a timeout or a 5xx means a rotated arena could
 * not be hosted again yet. Only voluntary, age-based rotations consult this. */
async function controlPlaneAnswers(app:Address){
 try{
  const response=await fetch(`https://control.interludelayer.xyz/sessions/${app}`,{signal:AbortSignal.timeout(5000)});
  await response.body?.cancel().catch(()=>{});return response.status<500;
 }catch{return false;}
}
/** No evidence file means no new capacity/admission; it never disables the
 * separate lifecycle observer or financial recovery. Actual hub reads define
 * capacity. A registered address or successful old HTTP response does not. */
export async function independentReusablePool(base:PublicClient,m:IndependentManifest,queue:Queue,
 health:()=>readonly {app:Address;epoch:string;stage:string;online:boolean}[],enabled:()=>boolean,
 budgetPath=process.env.PONG_INDEPENDENT_PUBLICATION_BUDGET,control:(app:Address)=>Promise<boolean>=controlPlaneAnswers,now:()=>number=Date.now){
 if(m.rulesVersion!==14)throw Error('Reusable human pool required');
 let reserveRetryAt=0;
 const unhealthySince=new Map<string,number>(),replaced=new Map<string,number[]>(),exhaustionAlerted=new Set<string>();
 let budget:ReusablePublicationBudget|undefined;
 const path=budgetPath;
 if(path){
  const hashes=await Promise.all(m.arenas.map(async a=>{
   const code=await base.getCode({address:a.app});if(!code||code==='0x')throw Error('Missing deployed human arena');return keccak256(code);
  }));
  budget=validateReusableBudget(JSON.parse(await readFile(path,'utf8')),hashes,14);
 }
 async function admissionReady(){
  if(!enabled()||!budget)return false;
  const block=await base.getBlock(),r=independentReader(base,m,block.number),states=health();
  const arenas=await Promise.all(m.arenas.map(async a=>({app:a.app,reserved:await r.lobby('reservedMatch',[a.app]),d:await readHubDelegation(base,m.hub,a.app,block.number)})));
  for(const a of arenas)if(a.d.status===1&&!a.reserved&&a.d.expiresAt<=block.timestamp+1860n){
   await queue(m.lobby,lobbyAbi,'closeReusableArena',[a.app],0n,0);return false;
  }
  const active=arenas.filter(a=>a.d.status===1&&a.d.expiresAt>block.timestamp+1860n);
  // Leave two live lanes while one arena cools. Opening a reserve does not
  // count it as ready until its hosted epoch is actually observed.
  if(active.length<3){
   const released=arenas.find(a=>a.d.status===0&&!a.reserved&&states.some(h=>h.app===a.app&&h.stage==='released'));
   if(released&&Date.now()>=reserveRetryAt){
    try{
     const validator=await base.readContract({address:m.hub,abi:hubAbi,functionName:'defaultValidator'});
     const terms=await base.readContract({address:m.hub,abi:hubAbi,functionName:'termsOf',args:[validator]});
     await queue(m.lobby,lobbyAbi,'openReusableArena',[released.app],terms.delegationFee,0);
    }catch(error){
     // A refused or unreachable reserve is not an outage of an already hosted
     // arena. Keep its actual epoch/health/budget checks below; never pretend
     // the failed opening created capacity or release its uncertain nonce.
     reserveRetryAt=Date.now()+Math.max(10000,engineReadRetryMs(error));
     console.warn(JSON.stringify({event:'arena-reserve-opening-deferred',arena:released.app,
      retryAt:new Date(reserveRetryAt).toISOString(),at:new Date().toISOString()}));
    }
   }
  }
  // Rotate the oldest epoch first. Registration order would repeatedly retire
  // the first two addresses and starve the third until expiry or exhaustion.
  const idle=active.filter(a=>!a.reserved).sort((a,b)=>a.d.baseBlock===b.d.baseBlock
   ?a.app.toLowerCase().localeCompare(b.app.toLowerCase()):a.d.baseBlock<b.d.baseBlock?-1:1);
  const readyCount=active.filter(a=>states.some(h=>h.app.toLowerCase()===a.app.toLowerCase()
   &&h.online&&BigInt(h.epoch)===a.d.epoch&&['available','countdown','playing','publishing'].includes(h.stage))).length;
  // Only an engine that never synchronizes counts as dead: every other stage
  // (forced close, sealing, review) already runs its own recovery.
  const t=now();
  for(const key of [...unhealthySince.keys()])if(!idle.some(a=>a.app.toLowerCase()===key))unhealthySince.delete(key);
  for(const a of idle){
   const key=a.app.toLowerCase(),h=states.find(s=>s.app.toLowerCase()===key);
   if(!h||h.online||h.stage!=='starting'){unhealthySince.delete(key);continue;}
   const since=unhealthySince.get(key)??t;unhealthySince.set(key,since);
   if(t-since<DEAD_ARENA_MS)continue;
   const opening=await base.getBlock({blockNumber:a.d.baseBlock});
   if(block.timestamp-opening.timestamp<DEAD_ARENA_MIN_EPOCH_SECONDS)continue;
   const {recent,allowed}=replacementBudget(replaced.get(key),t);
   if(!allowed){
    if(!exhaustionAlerted.has(key)){exhaustionAlerted.add(key);console.warn(JSON.stringify({event:'arena-replacement-exhausted',arena:a.app,
     epoch:String(a.d.epoch),since:new Date(since).toISOString(),at:new Date(t).toISOString()}));}
    continue;
   }
   // A new epoch needs Interlude to host it: never trade a dead node for none.
   if(!await control(a.app))continue;
   await queue(m.lobby,lobbyAbi,'closeReusableArena',[a.app],0n,0);
   unhealthySince.delete(key);exhaustionAlerted.delete(key);replaced.set(key,[...recent,t]);
   console.warn(JSON.stringify({event:'arena-replaced-unhealthy',arena:a.app,epoch:String(a.d.epoch),since:new Date(since).toISOString(),at:new Date(t).toISOString()}));
   return false;
  }
  for(const a of idle){
   const opening=await base.getBlock({blockNumber:a.d.baseBlock});
   const exhausted=!reusableAdmissionBudget(budget,a.d.batchIndex,a.d.expiresAt,block.timestamp);
   const leading=a.d.expiresAt<=block.timestamp+BigInt(budget.rotationLeadSeconds);
   // Age alone is a voluntary rotation: never retire a healthy arena into an
   // epoch that Interlude's control plane cannot host right now.
   if(exhausted||readyCount>=3&&(leading||block.timestamp-opening.timestamp>=BigInt(budget.serviceSeconds)&&await control(a.app))){
    await queue(m.lobby,lobbyAbi,'closeReusableArena',[a.app],0n,0);return false;
   }
  }
  // The contract selects the arena; require every possible idle choice to be
  // healthy and within its measured budget, rather than selecting it on VPS.
  return idle.length>0&&idle.every(a=>reusableAdmissionBudget(budget,a.d.batchIndex,a.d.expiresAt,block.timestamp)
   &&states.some(h=>h.app.toLowerCase()===a.app.toLowerCase()&&h.online&&h.stage==='available'&&BigInt(h.epoch)===a.d.epoch));
 }
 return{admissionReady,qualified:!!budget};
}
