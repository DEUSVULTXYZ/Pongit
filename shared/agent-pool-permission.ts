import {encodeAbiParameters,getAddress,keccak256,zeroAddress,type Address,type PublicClient} from 'viem';

/** Rules 10 stores arena-local overrides in the delegated `words` mapping at
 * slot zero. Call only after verifying this deployment's runtime hash and rules.
 * Reading these words also honors a renewal/revocation since admission; the
 * immutable boundMatch alone contains only the initial authorization. */
export async function readPoolPermission(node:PublicClient,app:Address,id:bigint,side:0|1,initial:{key:Address;expires:bigint}){
 const at=BigInt(54+side*3),head=await node.getBlockNumber();
 const values=await Promise.all([at,at+1n,at+2n].map(async field=>{
  const key=keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'},{type:'uint256'},{type:'uint256'}],[app,0n,id,field]));
  const slot=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[key,0n]));
  const value=await node.getStorageAt({address:app,slot,blockNumber:head});
  if(!value||!/^0x[\da-f]{64}$/i.test(value))throw Error('Arena permission could not be read');
  return BigInt(value);
 }));
 const key=getAddress(`0x${BigInt.asUintN(160,values[0]).toString(16).padStart(40,'0')}`);
 const expires=BigInt.asUintN(64,values[1]);
 return{key:key===zeroAddress?initial.key:key,expires:expires||initial.expires,revoked:((values[1]>>64n)&1n)===1n,revision:values[2]};
}
