import {encodeAbiParameters,hashTypedData,isAddress,keccak256,zeroAddress,zeroHash,type Address,type Hex} from 'viem';

export type ReusableTicket={authority:Address;arena:Address;epoch:bigint;sequence:bigint;matchId:bigint;bindingHash:Hex;issuedAt:bigint;expires:bigint;sourceBlock:bigint;sourceHash:Hex;rules:bigint};
export type ReusableBinding={id:bigint;room:bigint;a:Address;b:Address;keyA:Address;keyB:Address;expiresA:bigint;expiresB:bigint;mode:number;ranked:boolean;preparedBlock:bigint;epoch:bigint};
export const admissionTypes={ArenaAdmission:[
 {name:'authority',type:'address'},{name:'arena',type:'address'},{name:'epoch',type:'uint256'},
 {name:'sequence',type:'uint256'},{name:'matchId',type:'uint256'},{name:'bindingHash',type:'bytes32'},
 {name:'issuedAt',type:'uint64'},{name:'expires',type:'uint64'},{name:'sourceBlock',type:'uint64'},
 {name:'sourceHash',type:'bytes32'},{name:'rules',type:'uint256'},
]} as const;
export const reusableBindingParameters=[{type:'tuple',components:[
 {name:'id',type:'uint256'},{name:'room',type:'uint256'},{name:'a',type:'address'},{name:'b',type:'address'},
 {name:'keyA',type:'address'},{name:'keyB',type:'address'},{name:'expiresA',type:'uint64'},
 {name:'expiresB',type:'uint64'},{name:'mode',type:'uint8'},{name:'ranked',type:'bool'},
 {name:'preparedBlock',type:'uint64'},{name:'epoch',type:'uint256'},
]}] as const;
export function reusableAdmissionMessage(ticket:ReusableTicket){
 return {domain:{name:'PONGIT Testnet Admission',version:'1',chainId:10143,verifyingContract:ticket.arena},types:admissionTypes,primaryType:'ArenaAdmission' as const,message:ticket};
}
export const reusableAdmissionDigest=(ticket:ReusableTicket)=>hashTypedData(reusableAdmissionMessage(ticket));
export const reusableBindingHash=(binding:ReusableBinding)=>keccak256(encodeAbiParameters(reusableBindingParameters,[binding]));

/** Fail closed before attestation. Every evidence field must come from one
 * canonical Monad read set and the registered engine's actual epoch. A bridge
 * is still trusted for admission; this validation is not a state-proof claim. */
export function validateReusableAdmission(ticket:ReusableTicket,binding:ReusableBinding,e:{
 chainId:number;authority:Address;arena:Address;issuedDigest:Hex;sourceHash:Hex;
 reservedMatch:bigint;hubEpoch:bigint;hubStatus:number;hubExpires:bigint;
 engineEpoch:bigint;engineCount:number;now:bigint;
}){
 const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
 const address=(a:string)=>isAddress(a)&&!same(a,zeroAddress);
 if(e.chainId!==10143||ticket.rules!==14n||!address(ticket.authority)||!address(ticket.arena)
  ||!same(ticket.authority,e.authority)||!same(ticket.arena,e.arena)
  ||ticket.matchId<=0n||ticket.matchId!==e.reservedMatch||ticket.matchId!==binding.id
  ||ticket.epoch<=0n||ticket.epoch!==e.hubEpoch||ticket.epoch!==e.engineEpoch||ticket.epoch!==binding.epoch
  ||e.hubStatus!==1||e.hubExpires<=e.now+1860n
  ||!Number.isInteger(e.engineCount)||e.engineCount<0||e.engineCount>=65536||ticket.sequence!==BigInt(e.engineCount)+1n
  ||ticket.issuedAt>e.now||ticket.expires<=e.now||ticket.expires<=ticket.issuedAt||ticket.expires-ticket.issuedAt>120n
  ||ticket.sourceBlock<=0n||ticket.sourceBlock!==binding.preparedBlock||same(ticket.sourceHash,zeroHash)||!same(ticket.sourceHash,e.sourceHash)
  ||!same(ticket.bindingHash,reusableBindingHash(binding))||!same(e.issuedDigest,reusableAdmissionDigest(ticket))
  ||![binding.a,binding.b,binding.keyA,binding.keyB].every(address)||same(binding.a,binding.b)||same(binding.keyA,binding.keyB)
  ||![0,1].includes(binding.mode)||binding.expiresA<=e.now||binding.expiresB<=e.now
  ||binding.expiresA>ticket.issuedAt+7200n||binding.expiresB>ticket.issuedAt+7200n)throw Error('Admission differs from authoritative Monad ticket or current arena');
 return reusableAdmissionMessage(ticket);
}
