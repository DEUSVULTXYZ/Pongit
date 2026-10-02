import {decodeAbiParameters,type Abi,type Hex} from 'viem';
import {snapshotHeaderFields,decodeChaosRead} from './chaos-codec';
export type AgentSynchronization={
 pause:{status:number;human:number;limitUs:bigint;deadlineBlock:bigint;cancelBlock:bigint;resumeBlock:bigint};
 brainA:bigint;brainB:bigint;decision:bigint;pendingControls:bigint;controllers:bigint;
};
export const pauseFields=[{name:'status',type:'uint8'},{name:'human',type:'uint8'},{name:'limitUs',type:'uint64'},
 {name:'deadlineBlock',type:'uint64'},{name:'cancelBlock',type:'uint64'},{name:'resumeBlock',type:'uint64'}] as const;
export function validateSynchronization(sync:AgentSynchronization){
 const {pause:p}=sync;
 if(p.status>3||p.human>2||p.status<0||p.human<0||!Number.isInteger(p.status)||!Number.isInteger(p.human)
  ||(p.status===0)!==(p.human===0)||p.status>=2&&p.cancelBlock===0n||p.status===3&&p.resumeBlock===0n
  ||sync.controllers>>80n!==0n||Number(sync.controllers&255n)>8||Number(sync.controllers>>8n&255n)>8
  ||sync.decision>3601n||sync.pendingControls>>72n!==0n)throw Error('Unknown arena synchronization');
 return sync;
}
export function decodeSynchronizedRead(abi:Abi,data:Hex){
 const [, , , ,pause,brainA,brainB,decision,pendingControls,controllers]=decodeAbiParameters([
  {type:'tuple',components:snapshotHeaderFields(abi)}, {type:'uint256[8]'},{type:'uint256'},{type:'uint256'},
  {type:'tuple',components:pauseFields},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'},
 ],data);
 const decoded=decodeChaosRead(abi,data);
 return [...decoded.slice(0,13),decoded[13],validateSynchronization({pause,brainA,brainB,decision,pendingControls,controllers})];
}
export function queuedDirections(word:bigint){
 return ([0,1] as const).flatMap(side=>{
  const action=Number(word>>BigInt(side*35+32)&7n),at=word>>BigInt(side*35)&0xffffffffn;
  return action>=1&&action<=3?[{side,direction:(action-2) as -1|0|1,at}]:[];
 });
}
