import type {Pool} from 'pg';
import {BaseError,ExecutionRevertedError,HttpRequestError,TimeoutError,encodeFunctionData,keccak256,toFunctionSelector,toHex,type Address,type Hex,type PublicClient} from 'viem';
import {agentMetadata,CREATOR_GAS,pongStrategyAbi,REGISTRATION_WINDOW,steeredOnChain,STRATEGY_GAS,strategySamples} from '../../../shared/agents';

const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
const refuse=(message:string,code='AGENT_STRATEGY_INVALID')=>Object.assign(Error(message),{status:409,code});
const invalid=(message:string,code:string)=>Object.assign(Error(message),{status:400,code});
// A network failure says nothing about the strategy. Only an answer from the chain does.
const unreachable=(e:unknown)=>e instanceof BaseError&&!!e.walk(x=>x instanceof HttpRequestError||x instanceof TimeoutError);
const unavailable=()=>Object.assign(Error('Monad Testnet did not answer; try again shortly'),{status:503,code:'AGENT_SERVICE_UNAVAILABLE'});
// What a node says when the call itself ran and failed. Monad answers every halt with code 3,
// "execution reverted", except running out of gas: -32603, "out of gas" (its public endpoint on
// 2026-09-18, each halt injected by a state override). That code alone cannot tell it from a
// provider's own internal error; the message can. Other clients name the halt: revm "EVM error
// OutOfGas", geth "invalid opcode", "stack underflow". A rate limit, an internal error or state the
// provider cannot serve matches none of these.
const FAILED_CALL=/revert|out of gas|outofgas|gas required exceeds|evm error|invalid opcode|invalid jump|stack (?:underflow|overflow)|write protection|max call depth|return data out of bounds/i;
export function callFailed(e:unknown){
 if(!(e instanceof BaseError)||unreachable(e))return false;
 return !!e.walk(x=>x instanceof ExecutionRevertedError||(x as {code?:unknown}|null)?.code===3
  ||FAILED_CALL.test(x instanceof BaseError?x.details??'':String((x as Error|null)?.message??'')));
}

// A top-level call pays 21,000 and its calldata, 16 a nonzero byte and 4 a zero one, before the
// callee runs, and the callee gets exactly the rest. The arcade pays for reaching the contract out
// of its own gas and hands decide() exactly STRATEGY_GAS (AgentSteer._ask), creator() exactly
// CREATOR_GAS (AgentIdentity.creatorOf), so adding that cost gives each call exactly its budget
// there. Monad also enforces EIP-7623's floor, 21,000 plus 10 a calldata token, as a minimum; every
// call made here stays above it (tests/agents.test.ts).
export function callGas(data:Hex,budget:bigint){
 let gas=21_000n;for(let i=2;i<data.length;i+=2)gas+=data.slice(i,i+2)==='00'?4n:16n;
 return gas+budget;
}
export const strategyCallGas=(data:Hex)=>callGas(data,STRATEGY_GAS);
const CREATOR_CALL=toFunctionSelector('creator()'),MAX_ADDRESS=(1n<<160n)-1n;

/** Checks on Monad, before anything is written, that a contract can play: it exists, is not an
 *  account with a key, names the creator who signed, and answers -1, 0 or 1 within the arcade's gas
 *  budget on positions from both sides and both modes. The arcade itself tolerates any failure (the
 *  seat just holds), so this exists to tell a creator at once, rather than after a lost match. */
export async function vetStrategy(base:PublicClient,agent:Address,creator:Address){
 // Only an answer the contract gave condemns it; a provider that did not give one is a 503.
 const call=async(data:Hex,budget:bigint,fault:string)=>{
  try{return (await base.call({to:agent,data,gas:callGas(data,budget)})).data;}
  catch(e){if(callFailed(e))throw refuse(fault);throw unavailable();}
 };
 let code:Hex|undefined;
 try{code=await base.getCode({address:agent});}catch{throw unavailable();}
 if(!code||code==='0x')throw refuse('No contract is deployed at this strategy address on Monad Testnet');
 // An EIP-7702 account shows its delegation designator as code but keeps its own key, so it could
 // also sign as a key seat: its own registration, inputs, a concession.
 if(code.toLowerCase().startsWith('0xef0100'))throw refuse('This address is an account delegating its code (EIP-7702). It holds a key, so it cannot register as a strategy');
 // Read creator() as the arcade does at registration: its gas, the first word, an address.
 const named=`The strategy must return the signing creator from creator(), within ${CREATOR_GAS} gas`;
 const word=await call(CREATOR_CALL,CREATOR_GAS,named),value=word&&word.length>=66?BigInt(word.slice(0,66)):0n;
 if(value>MAX_ADDRESS||value!==BigInt(creator))throw refuse(named);
 for(const [index,sample] of strategySamples.entries()){
  const data=encodeFunctionData({abi:pongStrategyAbi,functionName:'decide',args:[sample as any]});
  const answer=await call(data,STRATEGY_GAS,`decide() reverted or used more than ${STRATEGY_GAS} gas on sample position ${index+1}`);
  // Read exactly as the arcade does: the first 32 bytes, as a signed word.
  if(!answer||answer.length<66)throw refuse(`decide() returned nothing on sample position ${index+1}`);
  const value=BigInt.asIntN(256,BigInt(answer.slice(0,66)));
  if(value<-1n||value>1n)throw refuse(`decide() must answer -1, 0 or 1; it answered ${value} on sample position ${index+1}`);
 }
}

// Session.recover, which AgentIdentity checks both proofs with, takes only v 27 or 28 and a low s.
const HALF_ORDER=0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;
const canonical=(proof:Hex)=>/^0x[\da-f]{128}1[bc]$/i.test(proof)&&BigInt('0x'+proof.slice(66,130))<=HALF_ORDER;
export type RegistrationRequest={creator:Address;agent:Address;name:string;avatar:number;modes:number;expires:bigint;creatorProof:Hex;agentProof?:Hex};
/** Every refusal of AgentIdentity.register the service can see in the request itself, answered as
 *  a 400 with its reason before anything is read or written. What the engine's rehearsal can still
 *  refuse is then what only the chain knows: whether the contract exists at the epoch's pinned block
 *  and names its creator there (vetStrategy checks both on Monad), and the engine's own clock.
 *  `now` is this service's clock in seconds. Returns the registration's metadata. */
export function checkRegistration(r:RegistrationRequest,now:bigint,houseAgent:boolean):Hex{
 let metadata:Hex;
 try{metadata=agentMetadata(r.name,r.avatar);}
 catch{throw invalid('A name is 2 to 32 letters, digits, spaces, dots, dashes or underscores, starting with a letter or digit; an avatar is 0 to 11','AGENT_NAME_INVALID');}
 // A seat registered with a house bot's name and avatar is steered on chain by that bot's policy
 // (AgentSteer._tier), never by its own logic, so only the house's own addresses may use them.
 if(steeredOnChain(metadata)&&!houseAgent)throw invalid(`${r.name} with avatar ${r.avatar} is a house bot; choose another name or avatar`,'AGENT_NAME_RESERVED');
 if(BigInt(r.creator)===0n||BigInt(r.agent)===0n||r.creator.toLowerCase()===r.agent.toLowerCase())throw invalid('The creator and the agent must be two different, nonzero addresses','AGENT_REGISTRATION_INVALID');
 if(!Number.isInteger(r.modes)||r.modes<1||r.modes>3)throw invalid('Modes is 1 for Classic, 2 for Chaos or 3 for both','AGENT_REGISTRATION_INVALID');
 if(r.expires<=now)throw invalid('This registration has expired; sign a fresh one','AGENT_REGISTRATION_EXPIRED');
 if(r.expires>now+REGISTRATION_WINDOW)throw invalid(`A registration must expire within ${REGISTRATION_WINDOW} seconds; sign one that does`,'AGENT_REGISTRATION_WINDOW');
 for(const proof of [r.creatorProof,r.agentProof])if(proof!==undefined&&!canonical(proof))throw invalid('Sign with v 27 or 28 and a low s, as the arcade requires','AGENT_REGISTRATION_SIGNATURE');
 return metadata;
}

/** The engine executes against Monad as it was when its epoch opened, so a strategy deployed
 *  after that block does not exist for it yet. Rehearse the registration on the engine itself,
 *  after checkRegistration and vetStrategy passed. Of the causes of InvalidRegistration two are
 *  then left: the expiry window read against the engine's own clock, checked here from its latest
 *  block, and the pinned epoch, which is blamed only when the clock does not explain it. */
export async function engineSeesStrategy(simulate:()=>Promise<unknown>,engine:{baseBlock:bigint;expires:bigint;clock:()=>Promise<bigint>}){
 const down=()=>Object.assign(Error('The arcade engine did not answer; try again shortly'),{status:503,code:'AGENT_SERVICE_UNAVAILABLE'});
 try{await simulate();}
 catch(e){
  if(unreachable(e))throw down();
  const reason=e instanceof BaseError?(e.walk(x=>!!(x as any).data?.errorName) as any)?.data?.errorName:undefined;
  if(reason==='InvalidRegistration'){
   let now:bigint;try{now=await engine.clock();}catch{throw down();}
   if(engine.expires<=now||engine.expires>now+REGISTRATION_WINDOW)
    throw refuse(`The arcade's clock reads ${now}, and a registration must expire within ${REGISTRATION_WINDOW} seconds of it; sign a fresh one`,'AGENT_REGISTRATION_WINDOW');
   throw refuse(`The arcade's current epoch reads Monad as of block ${engine.baseBlock}, before this strategy existed. Register it again after the arcade's next renewal`,'AGENT_STRATEGY_NEXT_EPOCH');
  }
  throw refuse(`The arcade refused this registration${reason?`: ${reason}`:''}`);
 }
}

/** The id of each agent's last match in `mode`, however far back. A window of recent matches would
 *  tie everyone who has left it with those who never played, and starve the latest registered. */
export async function lastMatches(db:Pick<Pool,'query'>,app:string,mode:number,agents:readonly string[]){
 return new Map<string,bigint>((await db.query(`SELECT player,max(id)::text AS last FROM (SELECT a AS player,id FROM agent_arcade.matches WHERE app=$1 AND mode=$2
   UNION ALL SELECT b,id FROM agent_arcade.matches WHERE app=$1 AND mode=$2) seats WHERE player=ANY($3) GROUP BY player`,[app,mode,agents])).rows.map(x=>[x.player,BigInt(x.last)]));
}
/** The next league pairing: whoever has waited longest, against whoever has waited longest among
 *  other creators. `last` holds the id of each agent's last match in this mode, however long ago,
 *  so every qualified agent gets its turn however many register, and two house bots meet only when
 *  nobody else is there. */
export function leaguePair<T extends {agent:string;creator:string}>(qualified:readonly T[],last:ReadonlyMap<string,bigint>):[T,T]|undefined{
 if(qualified.length<2)return;
 // Never played ranks first; a stable sort keeps registration order among equals.
 const at=(x:T)=>last.get(x.agent)??0n,order=[...qualified].sort((x,y)=>at(x)<at(y)?-1:at(x)>at(y)?1:0);
 const a=order[0],b=order.find(x=>x.agent!==a.agent&&x.creator!==a.creator)??order.find(x=>x.agent!==a.agent)!;
 return [a,b];
}

// A strategy qualifies by completing a friendly match in which its paddle left the centre it
// starts on, which only its own answers can do. Frames store paddle centres in 1e6 pixels.
export const STRATEGY_START='288000000',STRATEGY_MOVED_FRAMES=3;
// Its creator may queue a failed strategy again, but each attempt is a whole friendly match, and no
// ranked league match starts while one runs. So a strategy gets its first match and
// STRATEGY_RETRIES more per mode within any STRATEGY_COOLDOWN seconds. Past that the mode is
// 'failed', and its creator can queue it again only once the oldest attempt has aged out.
export const STRATEGY_RETRIES=3,STRATEGY_COOLDOWN=24*60*60;
/** Start times, in seconds, of the strategy's qualification matches in `mode` played to the end
 *  within the cool-down. A lapsed offer is not an attempt: nothing of the strategy was tried. */
export async function strategyAttempts(db:Pick<Pool,'query'>,app:string,agent:string,mode:number){
 return (await db.query(`SELECT extract(epoch FROM created_at)::float8 AS at FROM agent_arcade.matches WHERE app=$1 AND kind='qualification' AND mode=$2 AND $3 IN (a,b)
   AND status IN ('publishing','complete') AND result->>'phase'='3' AND created_at>now()-make_interval(secs=>$4)`,[app,mode,agent,STRATEGY_COOLDOWN])).rows.map(x=>Number(x.at));
}
/** Whether its creator's registration may queue a strategy's mode again, and if not, when it can. */
export function strategyRequeue(state:string|undefined,attempts:readonly number[]):{queue:boolean;retryAt?:number}{
 if(state!=='registered'&&state!=='retry'&&state!=='failed')return {queue:false};
 if(attempts.length<=STRATEGY_RETRIES)return {queue:true};
 const sorted=[...attempts].sort((x,y)=>x-y);
 return {queue:false,retryAt:sorted[sorted.length-1-STRATEGY_RETRIES]+STRATEGY_COOLDOWN};
}
/** The evidence a strategy's qualifyAgent commits to, built only from what cannot change once the
 *  match has ended, so a command retried after a lost reply or a restart is byte for byte the one
 *  journaled. The moved-frame count is not such a thing: frames are written asynchronously, and a
 *  restart captures the terminal one again. The evidence names the rule the frames passed instead. */
export function strategyEvidence(match:{app:string;id:string|bigint;epoch:string|bigint},result:unknown):Hex{
 return keccak256(toHex(json({app:match.app,id:String(match.id),epoch:String(match.epoch),result,strategy:true,rule:{start:STRATEGY_START,movedFrames:STRATEGY_MOVED_FRAMES}})));
}
/** A strategy's verdict on a qualification match played to the end. A pass an earlier cycle
 *  journaled stands, and its command is sent again exactly as journaled, whatever the frames say
 *  now; otherwise the frames decide, and a failure is a retry until the retries are used. */
export async function strategyVerdict(agent:string,mode:number,io:{journaled?:readonly unknown[];moved:()=>Promise<number>;evidence:()=>Promise<Hex>;
 send:(args:readonly unknown[])=>Promise<unknown>;attempts:()=>Promise<number>}):Promise<'qualified'|'retry'|'failed'>{
 if(io.journaled){await io.send(io.journaled);return 'qualified';}
 if(await io.moved()>=STRATEGY_MOVED_FRAMES){await io.send([agent,mode,true,await io.evidence()]);return 'qualified';}
 return await io.attempts()>STRATEGY_RETRIES?'failed':'retry';
}
