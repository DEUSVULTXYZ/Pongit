import {zeroAddress,zeroHash,type Abi,type Address} from 'viem';
import {agentCatalogAbi as catalogAbi} from '../../../shared/abi-AgentCatalog';
import {agentQualificationsAbi as qualificationAbi} from '../../../shared/abi-AgentQualifications';
import {agentChallengesAbi as challengeAbi} from '../../../shared/abi-AgentChallenges';
import {abi as familyAbi} from '../../../shared/abi-independent-ArcadeFamily';
import {agentTournamentsAbi as bookAbi} from '../../../shared/abi-AgentTournaments';
import {agentArenaPoolAbi as poolAbi} from '../../../shared/abi-AgentArenaPool';
import {houseInstanceAbi} from '../../../shared/agent-house-instances';

export type PoolRead=<T=any>(address:Address,abi:Abi,fn:string,args?:readonly unknown[])=>Promise<T>;

/** One public tournament every three days. The book's own nextAt is a one-minute
 * safety floor, not a cadence: starting tournaments back to back spent the
 * Interlude engine budget continuously. The keeper owns the public cadence and
 * anchors it on the previous tournament's onchain start, so neither a keeper
 * restart nor a lost local state file can shorten the gap. */
export const tournamentIntervalSeconds=3n*24n*60n*60n;
export function tournamentDue(last:{startedAt:bigint}|null,nextAt:bigint,now:bigint){
 return now>=nextAt&&(!last||now>=last.startedAt+tournamentIntervalSeconds);
}
type Common={catalog:Address;qualifications:Address;challenges:Address;family:Address;tournaments:Address;pool:Address;houseInstances?:'official-v1'};

/** Capture clears the active lane. Recover its tournament work from the durable
 * pool record before the slower historical scan, including after a restart. */
export async function capturedTournamentWork(read:PoolRead,m:Common,record:any){
 if(!record.captured||!record.tournament||!record.ref.id)return null;
 const f=await read(m.tournaments,bookAbi,'fixture',[record.tournament,record.fixture]);
 if(!f.bound||f.ref.chainId!==record.ref.chainId||f.ref.epoch!==record.ref.epoch||f.ref.id!==record.ref.id
  ||f.ref.arena.toLowerCase()!==record.ref.arena.toLowerCase())return null;
 const result=await read(m.pool,poolAbi,'result',[record.ref]);
 if(result.hash!==f.published.hash||result.finality!==f.published.finality||result.status!==f.published.status)
  return{to:m.tournaments,method:'synchronize',args:[record.tournament,record.fixture]};
 if(!f.resolved&&result.status===4&&result.finality)
  return{to:m.tournaments,method:'retryCancelled',args:[record.tournament,record.fixture]};
 return null;
}

/** Resumable inspection of the entire catalogue, without a first-256 cutoff.
 * This never chooses the trial participants; the contract cursor does that. */
export async function qualificationWork(read:PoolRead,m:Common,cursor:bigint,now:bigint,budget=16,baseBlock?:bigint){
 if(!Number.isInteger(budget)||budget<1||budget>32)throw Error('Qualification inspection budget');
 const count=await read<bigint>(m.catalog,catalogAbi,'count');if(!count)return{needed:false,next:0n};
 let at=cursor%count;
 for(let n=0;n<budget&&BigInt(n)<count;n++){
  const agent=await read<Address>(m.catalog,catalogAbi,'at',[at]);at=(at+1n)%count;
  const identity=await read(m.catalog,catalogAbi,'identity',[agent]);
  if(baseBlock!==undefined&&!identity.house&&await read<bigint>(m.catalog,catalogAbi,'registeredBlock',[agent])>baseBlock)continue;
  for(const mode of [0,1])if(identity.available&&(identity.modes&(1<<mode))&&!(identity.qualified&(1<<mode))){
   if(await read<bigint>(m.qualifications,qualificationAbi,'retryAt',[agent,mode])>now)continue;
   if(!await read<boolean>(m.catalog,catalogAbi,'qualificationEligible',[agent,mode]))continue;
   // The contract needs an available house opponent, not just a candidate.
   // Otherwise it only advances its scan cursor and burns sponsor transactions
   // while every house identity is reserved by a tournament.
   for(let j=0;j<8;j++){
    const opponent=await read<Address>(m.catalog,catalogAbi,'house',[(j+2)%8]);
    if(opponent!==zeroAddress&&opponent.toLowerCase()!==agent.toLowerCase()
     &&await (m.houseInstances?read<boolean>(m.qualifications,houseInstanceAbi,'opponentEligible',[opponent,mode])
      :read<boolean>(m.catalog,catalogAbi,'qualificationEligible',[opponent,mode])))return{needed:true,next:at};
   }
  }
 }
 return{needed:false,next:at};
}

/** A revoked/expired waiting grant frees the queue, never an active match.
 * Revalidate on-chain in expire(); an RPC error must not be treated as expiry. */
export async function expiredChallenge(read:PoolRead,m:Common,cursor:bigint,budget=8){
 if(!Number.isInteger(budget)||budget<1||budget>32)throw Error('Challenge inspection budget');
 const count=await read<bigint>(m.challenges,challengeAbi,'count');if(!count)return{expired:null,next:1n};
 let at=cursor>=1n&&cursor<=count?cursor:1n;
 for(let n=0;n<budget&&BigInt(n)<count;n++){
  const id=at;at=at===count?1n:at+1n;
  const request=await read(m.challenges,challengeAbi,'requests',[id]);
  // Solidity's public mapping getter returns the tuple in ABI order.
  const [player,,,status,,expected]=request;
  if(status!==1)continue;
  const grant=await read(m.family,familyAbi,'grantOf',[player]);
  if(grant.key===zeroAddress||await read(m.family,familyAbi,'grantDigest',[grant])!==expected)return{expired:id,next:at};
 }
 return{expired:null,next:at};
}

export async function historicalRepairWork(read:PoolRead,m:Common,id:bigint,t:any,idle:bigint,laneFree:boolean){
 if(!idle||!laneFree)return null;
 if(t.status===4){
  // A newer tournament/challenge owns its locks until it finishes. Frozen
  // controllers also cannot silently be replaced while repairing history.
  for(let i=0;i<8;i++){
   if(!await read<boolean>(m.catalog,catalogAbi,'eligible',[t.agents[i],t.mode]))return null;
   if((await read(m.catalog,catalogAbi,'identity',[t.agents[i]])).codeHash!==t.controllers[i])return null;
  }
  return{to:m.tournaments,method:'resumeRepair',args:[id]};
 }
 if(t.status===2){
  const [index,a,b]=await read(m.tournaments,bookAbi,'nextFixture',[id]);
  if(index!==255&&await read(m.pool,poolAbi,'playing',[a])===zeroHash&&await read(m.pool,poolAbi,'playing',[b])===zeroHash)
   return{to:m.pool,method:'admitTournament',args:[id]};
 }
 return null;
}
