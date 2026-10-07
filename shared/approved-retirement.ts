import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi,zeroHash,type Address,type Hex} from 'viem';

/** An offline, one-operation approval. Never installed in a keeper or selected
 * through an environment flag. Only the listed normal closes can be signed. */
export type ApprovedRetirement={
 evidence:Hex; deadline:number;
 arenas:readonly {authority:Address;app:Address;epoch:bigint}[];
};
const abi=parseAbi(['function closeReusableArena(address app)']);
export function approvedRetirementGuard(
 read:(app:Address)=>Promise<{epoch:bigint;status:number;beneficiary:Address}>,
 approval:ApprovedRetirement,
){
 assert(/^0x[\da-f]{64}$/i.test(approval.evidence)&&approval.evidence!==zeroHash,'Retirement evidence required');
 assert(approval.deadline>Date.now()&&approval.deadline<=Date.now()+2*60*60*1000,'Bounded retirement approval required');
 assert(approval.arenas.length>0&&approval.arenas.length<=16);
 const calls=approval.arenas.map(a=>({...a,data:encodeFunctionData({abi,functionName:'closeReusableArena',args:[a.app]})}));
 assert.equal(new Set(calls.map(a=>a.app.toLowerCase())).size,calls.length,'Duplicate retirement arena');
 return async(to:Address|undefined,data:Hex)=>{
  const a=calls.find(a=>a.authority.toLowerCase()===to?.toLowerCase()&&a.data.toLowerCase()===data.toLowerCase());
  if(!a)return false;
  assert(Date.now()<approval.deadline,'Retirement approval expired');
  const d=await read(a.app);
  assert.equal(d.epoch,a.epoch,'Retirement epoch changed');
  assert.equal(d.status,1,'Only the approved active epoch may close');
  assert.equal(d.beneficiary.toLowerCase(),a.authority.toLowerCase(),'Retirement authority changed');
  return true;
 };
}
