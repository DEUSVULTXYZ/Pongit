import {readFile} from 'node:fs/promises';
import {keccak256,type Abi,type Address,type PublicClient} from 'viem';
import type {IndependentManifest} from '../../shared/independent';
import {independentReader} from '../../shared/independent-read';
import {readHubDelegation} from '../../shared/rooms-hub';
import {abi as lobbyAbi} from '../../shared/abi-independent-ReusableEventsLobby';
import {abi as hubAbi} from '../../shared/abi-independent-IInterludeHub';
import {validateReusableBudget,reusableAdmissionBudget,type ReusablePublicationBudget} from './agents/reusable-budget';

type Queue=(at:Address,abi:Abi,name:string,args:readonly unknown[],value?:bigint,priority?:number)=>Promise<unknown>;
/** No evidence file means no new capacity/admission; it never disables the
 * separate lifecycle observer or financial recovery. Actual hub reads define
 * capacity. A registered address or successful old HTTP response does not. */
export async function independentReusablePool(base:PublicClient,m:IndependentManifest,queue:Queue,
 health:()=>readonly {app:Address;epoch:string;stage:string;online:boolean}[],enabled:()=>boolean,
 budgetPath=process.env.PONG_INDEPENDENT_PUBLICATION_BUDGET){
 if(m.rulesVersion!==14)throw Error('Reusable human pool required');
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
   if(released){
    const validator=await base.readContract({address:m.hub,abi:hubAbi,functionName:'defaultValidator'});
    const terms=await base.readContract({address:m.hub,abi:hubAbi,functionName:'termsOf',args:[validator]});
    await queue(m.lobby,lobbyAbi,'openReusableArena',[released.app],terms.delegationFee,0);
   }
  }
  // Rotate the oldest epoch first. Registration order would repeatedly retire
  // the first two addresses and starve the third until expiry or exhaustion.
  const idle=active.filter(a=>!a.reserved).sort((a,b)=>a.d.baseBlock===b.d.baseBlock
   ?a.app.toLowerCase().localeCompare(b.app.toLowerCase()):a.d.baseBlock<b.d.baseBlock?-1:1);
  const readyCount=active.filter(a=>states.some(h=>h.app.toLowerCase()===a.app.toLowerCase()
   &&h.online&&BigInt(h.epoch)===a.d.epoch&&['available','countdown','playing','publishing'].includes(h.stage))).length;
  for(const a of idle){
   const opening=await base.getBlock({blockNumber:a.d.baseBlock});
   const exhausted=!reusableAdmissionBudget(budget,a.d.batchIndex,a.d.expiresAt,block.timestamp);
   if(exhausted||readyCount>=3&&(block.timestamp-opening.timestamp>=BigInt(budget.serviceSeconds)
    ||a.d.expiresAt<=block.timestamp+BigInt(budget.rotationLeadSeconds))){
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
