import {BaseError,HttpRequestError,TimeoutError,encodeFunctionData,type Address,type Hex,type PublicClient} from 'viem';
import {pongStrategyAbi,STRATEGY_GAS,strategySamples} from '../../../shared/agents';

const refuse=(message:string,code='AGENT_STRATEGY_INVALID')=>Object.assign(Error(message),{status:409,code});
// A network failure says nothing about the strategy. Only an answer from the chain does.
const unreachable=(e:unknown)=>e instanceof BaseError&&!!e.walk(x=>x instanceof HttpRequestError||x instanceof TimeoutError);
const unavailable=()=>Object.assign(Error('Monad Testnet did not answer; try again shortly'),{status:503,code:'AGENT_SERVICE_UNAVAILABLE'});

// A top-level call pays 21,000 and its calldata before the callee runs: 16 a nonzero byte,
// 4 a zero one. Adding those to the arcade's budget gives decide() about what it gets there.
export function strategyCallGas(data:Hex){
 let gas=21_000n;for(let i=2;i<data.length;i+=2)gas+=data.slice(i,i+2)==='00'?4n:16n;
 return gas+STRATEGY_GAS+2_000n;
}

/** Checks on Monad, before anything is written, that a contract can play: it exists, names the
 *  creator who signed, and answers -1, 0 or 1 within the arcade's gas budget on positions from
 *  both sides and both modes. The arcade itself tolerates any failure (the seat just holds), so
 *  this exists to tell a creator at once, rather than after a lost match. */
export async function vetStrategy(base:PublicClient,agent:Address,creator:Address){
 let code:Hex|undefined;
 try{code=await base.getCode({address:agent});}catch{throw unavailable();}
 if(!code||code==='0x')throw refuse('No contract is deployed at this strategy address on Monad Testnet');
 let named:Address|undefined;
 try{named=await base.readContract({address:agent,abi:pongStrategyAbi,functionName:'creator'}) as Address;}
 catch(e){if(unreachable(e))throw unavailable();}
 if(named?.toLowerCase()!==creator.toLowerCase())throw refuse('The strategy must return the signing creator from creator()');
 for(const [index,sample] of strategySamples.entries()){
  const data=encodeFunctionData({abi:pongStrategyAbi,functionName:'decide',args:[sample as any]});
  let answer:Hex|undefined;
  try{answer=(await base.call({to:agent,data,gas:strategyCallGas(data)})).data;}
  catch(e){if(unreachable(e))throw unavailable();throw refuse(`decide() reverted or used more than ${STRATEGY_GAS} gas on sample position ${index+1}`);}
  // Read exactly as the arcade does: the first 32 bytes, as a signed word.
  if(!answer||answer.length<66)throw refuse(`decide() returned nothing on sample position ${index+1}`);
  const value=BigInt.asIntN(256,BigInt(answer.slice(0,66)));
  if(value<-1n||value>1n)throw refuse(`decide() must answer -1, 0 or 1; it answered ${value} on sample position ${index+1}`);
 }
}

/** The engine executes against Monad as it was when its epoch opened, so a strategy deployed
 *  after that block does not exist for it yet. Rehearse the registration on the engine itself,
 *  after vetStrategy passed on Monad: a refusal then means the engine cannot see the contract. */
export async function engineSeesStrategy(simulate:()=>Promise<unknown>,baseBlock:bigint){
 try{await simulate();}
 catch(e){
  if(unreachable(e))throw Object.assign(Error('The arcade engine did not answer; try again shortly'),{status:503,code:'AGENT_SERVICE_UNAVAILABLE'});
  // Monad has just confirmed the contract and its creator, so the one refusal that means the
  // engine cannot see it is InvalidRegistration. Anything else, or no reason, is reported as is.
  const reason=e instanceof BaseError?(e.walk(x=>!!(x as any).data?.errorName) as any)?.data?.errorName:undefined;
  if(reason==='InvalidRegistration')throw refuse(`The arcade's current epoch reads Monad as of block ${baseBlock}, before this strategy existed. Register it again after the arcade's next renewal`,'AGENT_STRATEGY_NEXT_EPOCH');
  throw refuse(`The arcade refused this registration${reason?`: ${reason}`:''}`);
 }
}

/** The next league pairing: whoever has waited longest, against whoever has waited longest among
 *  other creators. Every qualified agent gets its turn however many register, and two house bots
 *  meet only when nobody else is there. `recent` is newest first. */
export function leaguePair<T extends {agent:string;creator:string}>(qualified:readonly T[],recent:readonly {a:string;b:string}[]):[T,T]|undefined{
 if(qualified.length<2)return;
 const last=new Map<string,number>();
 recent.forEach((match,index)=>{for(const player of [match.a,match.b])if(!last.has(player))last.set(player,recent.length-index);});
 // Never played ranks first; a stable sort keeps registration order among equals.
 const order=[...qualified].sort((x,y)=>(last.get(x.agent)??0)-(last.get(y.agent)??0));
 const a=order[0],b=order.find(x=>x.agent!==a.agent&&x.creator!==a.creator)??order.find(x=>x.agent!==a.agent)!;
 return [a,b];
}

// A strategy qualifies by completing a friendly match in which its paddle left the centre it
// starts on, which only its own answers can do. Frames store paddle centres in 1e6 pixels.
export const STRATEGY_START='288000000',STRATEGY_MOVED_FRAMES=3;
