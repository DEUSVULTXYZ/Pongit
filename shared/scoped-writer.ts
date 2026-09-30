import {isAddress,keccak256,stringToHex,type Address,type Hex} from 'viem';

export const LEGACY_OPERATOR='0x369158ac444278541322643e46e0d5b45ac21c4c';
export type ScopedWriter={keyFile:string;address:Address;allowCall:(to:Address,data:Hex,value:bigint)=>void;
 /** An estimate-only equivalent may require optional work to succeed. The
  * original transaction bytes remain the sole journalled/signed intent. */
 strictEstimate?:(to:Address,data:Hex,value:bigint)=>{to:Address;data:Hex;value:bigint}|null};

/** The old signer keeps its existing advisory lock and journal namespace.
 * A new role gets exactly one lock across services, derived from its address. */
export function writerIdentity(actual:Address,scope?:ScopedWriter){
 const owner=actual.toLowerCase();
 if(!isAddress(actual))throw Error('Invalid signer identity');
 if(!scope)return{owner,lock:'701340',prefix:'independent:',scoped:false};
 if(!scope.keyFile||!isAddress(scope.address)||scope.address.toLowerCase()!==owner||owner===LEGACY_OPERATOR)
  throw Error('Scoped signer does not match its dedicated role');
 const lock=String(BigInt(keccak256(stringToHex(`pongit:signer:${owner}`)).slice(0,17)));
 return{owner,lock,prefix:`independent:${owner}:`,scoped:true};
}
