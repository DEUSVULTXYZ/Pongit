import {keccak256,type Address,type Hex} from 'viem';

/** External code is pinned to the hub's opening block. An engine RPC may return
 * empty eth_getCode for an external contract even though internal calls load it
 * from Monad. Read the exact canonical base block, never the current code.
 * The arena still checks EXTCODEHASH internally when admitting the ticket. */
export async function pinnedEngineCodeHash(o:{
 address:Address;hubBaseBlock:bigint;engineBaseBlock:unknown;hubEpoch:bigint;engineEpoch:unknown;
 getCode:(args:{address:Address;blockNumber:bigint})=>Promise<Hex|undefined>;
}){
 const quantity=(v:unknown)=>{
  if(typeof v==='number'&&!Number.isSafeInteger(v))throw Error('Invalid engine base identity');
  if(!['number','bigint','string'].includes(typeof v))throw Error('Missing engine base identity');
  return BigInt(v as bigint);
 };
 if(o.hubBaseBlock<=0n||o.hubEpoch<=0n||quantity(o.engineBaseBlock)!==o.hubBaseBlock||quantity(o.engineEpoch)!==o.hubEpoch)
  throw Error('Engine base differs from the active hub session');
 const code=await o.getCode({address:o.address,blockNumber:o.hubBaseBlock});
 if(!code||code==='0x')throw Error('Strategy code is absent from the engine base block');
 return keccak256(code);
}
