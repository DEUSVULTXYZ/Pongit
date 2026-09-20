import {encodeAbiParameters,isAddress,keccak256,zeroAddress,zeroHash,type Address,type Hex} from 'viem';
import {reusableAdmissionDigest,reusableAdmissionMessage,type ReusableTicket} from './reusable-admission';

export type ReusableAgentController={codeHash:Hex;memoryWord:bigint;house:number;key:Address;expires:bigint};
export type ReusableAgentBinding={id:bigint;epoch:bigint;preparedBlock:bigint;tournament:bigint;a:Address;b:Address;mode:number;ranked:boolean;overtime:boolean;controlA:ReusableAgentController;controlB:ReusableAgentController};
const controller=[{name:'codeHash',type:'bytes32'},{name:'memoryWord',type:'uint256'},{name:'house',type:'uint8'},{name:'key',type:'address'},{name:'expires',type:'uint64'}] as const;
export const reusableAgentBindingParameters=[{type:'tuple',components:[
 {name:'id',type:'uint256'},{name:'epoch',type:'uint256'},{name:'preparedBlock',type:'uint64'},{name:'tournament',type:'uint64'},
 {name:'a',type:'address'},{name:'b',type:'address'},{name:'mode',type:'uint8'},{name:'ranked',type:'bool'},{name:'overtime',type:'bool'},
 {name:'controlA',type:'tuple',components:controller},{name:'controlB',type:'tuple',components:controller},
]}] as const;
export const reusableAgentBindingHash=(binding:ReusableAgentBinding)=>keccak256(encodeAbiParameters(reusableAgentBindingParameters,[binding]));

/** Admission attestation only, never a result or spending proof. All base
 * evidence must be read at one canonical Monad block; code hashes are also
 * checked in the target engine's immutable base state before signing. */
export function validateReusableAgentAdmission(ticket:ReusableTicket,b:ReusableAgentBinding,e:{
 chainId:number;authority:Address;arena:Address;issuedDigest:Hex;sourceHash:Hex;
 reservedMatch:bigint;hubEpoch:bigint;hubStatus:number;hubExpires:bigint;
 engineEpoch:bigint;engineCount:number;now:bigint;engineCodeHashA:Hex;engineCodeHashB:Hex;
}){
 const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
 const address=(a:string)=>isAddress(a)&&!same(a,zeroAddress);
 const valid=(c:ReusableAgentController,code:Hex)=>{
  if(!Number.isInteger(c.house)||c.house<0||c.house>8||c.memoryWord<0n||c.memoryWord>>192n!==0n)return false;
  if(same(c.codeHash,zeroHash))return c.house===0&&c.memoryWord===0n&&address(c.key)&&c.expires>e.now&&c.expires<=ticket.issuedAt+7200n;
  return same(c.key,zeroAddress)&&c.expires===0n&&same(c.codeHash,code);
 };
 if(e.chainId!==10143||ticket.rules!==15n||!address(ticket.authority)||!address(ticket.arena)
  ||!same(ticket.authority,e.authority)||!same(ticket.arena,e.arena)||ticket.matchId<=0n||ticket.matchId!==e.reservedMatch||ticket.matchId!==b.id
  ||ticket.epoch<=0n||ticket.epoch!==e.hubEpoch||ticket.epoch!==e.engineEpoch||ticket.epoch!==b.epoch
  ||e.hubStatus!==1||e.hubExpires<=e.now+420n||!Number.isInteger(e.engineCount)||e.engineCount<0||e.engineCount>=65536||ticket.sequence!==BigInt(e.engineCount)+1n
  ||ticket.issuedAt>e.now||ticket.expires<=e.now||ticket.expires<=ticket.issuedAt||ticket.expires-ticket.issuedAt>120n
  ||ticket.sourceBlock<=0n||ticket.sourceBlock!==b.preparedBlock||same(ticket.sourceHash,zeroHash)||!same(ticket.sourceHash,e.sourceHash)
  ||!same(ticket.bindingHash,reusableAgentBindingHash(b))||!same(e.issuedDigest,reusableAdmissionDigest(ticket))
  ||!address(b.a)||!address(b.b)||same(b.a,b.b)||![0,1].includes(b.mode)
  ||!valid(b.controlA,e.engineCodeHashA)||!valid(b.controlB,e.engineCodeHashB)
  ||same(b.controlA.codeHash,zeroHash)&&same(b.controlB.codeHash,zeroHash))throw Error('Agent admission differs from Monad authority or engine base code');
 return reusableAdmissionMessage(ticket);
}
