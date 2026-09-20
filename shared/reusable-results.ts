import {decodeEventLog,encodeAbiParameters,keccak256,type Abi,type Address,type Hex} from 'viem';
import type {EngineFrame} from './engine-stream';
import {publishedResultLeaf,type ResultEpoch} from './published-result-tree';

export type ReusableResultCandidate=ResultEpoch&{
 rules:14|15;matchId:bigint;index:number;ticketHash:Hex;resultHash:Hex;leaf:Hex;root:Hex;canonical:Hex;transactionHash:Hex;
};

/** Preserve complete results before the physical slot is reused. These are
 * untrusted publication candidates, not settled results. A consumer must match
 * the issued Monad ticket and build a proof against its canonical published root.
 * No frame history, signature or private authorization is included. */
export function reusableResults(abi:Abi,app:Address,rules:14|15,frame:EngineFrame):ReusableResultCandidate[]{
 if(frame.app.toLowerCase()!==app.toLowerCase())throw Error('Result frame belongs to another arena');
 const output=abi.find(x=>x.type==='function'&&x.name==='publishedResult');
 if(!output||output.type!=='function'||output.outputs.length!==1)throw Error('Missing canonical result ABI');
 const completed=new Map<string,any>(),committed=new Map<string,any>();
 for(const log of frame.logs){
  if(log.address.toLowerCase()!==app.toLowerCase())continue;
  let event:any;try{event=decodeEventLog({abi,topics:[...log.topics] as any,data:log.data});}catch{continue;}
  const args=event.args;
  if(event.eventName==='Completed'){
   const key=`${args.epoch}:${args.id}`;if(completed.has(key))throw Error('Repeated completion in one receipt');completed.set(key,args);
  }else if(event.eventName==='ResultCommitted'){
   const key=`${args.epoch}:${args.matchId}`;if(committed.has(key))throw Error('Repeated result commitment in one receipt');committed.set(key,args);
  }
 }
 const results:ReusableResultCandidate[]=[];
 for(const [key,c] of committed){
  const e=completed.get(key),result=e?.result,match=result?.match_,ref=match?.ref??match;
  if(!e||!match||ref.id!==c.matchId||ref.epoch!==c.epoch||ref.arena.toLowerCase()!==app.toLowerCase()
   ||result.rules!==BigInt(rules)||(rules===15&&ref.chainId!==10143n)||c.epoch<=0n||c.matchId<=0n
   ||!Number.isInteger(c.index)||c.index<0||c.index>=65536||![3,4].includes(match.status))
   throw Error('Incomplete or mismatched canonical result');
  const canonical=encodeAbiParameters(output.outputs,[result]),resultHash=keccak256(canonical);
  const identity={chainId:10143n,arena:app,epoch:c.epoch};
  const leaf=publishedResultLeaf(identity,c.matchId,c.ticketHash,resultHash);
  if(resultHash!==c.resultHash||leaf!==c.leaf)throw Error('Canonical result differs from its commitment');
  results.push({...identity,rules,matchId:c.matchId,index:c.index,ticketHash:c.ticketHash,resultHash,leaf,root:c.root,canonical,transactionHash:frame.hash});
 }
 if(completed.size!==committed.size)throw Error('Completed result is missing its commitment');
 return results;
}
