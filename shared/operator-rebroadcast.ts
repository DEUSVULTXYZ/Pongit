import {keccak256,parseTransaction,recoverTransactionAddress,type PublicClient,type Address,type Hex,type TransactionSerialized} from 'viem';

/** Monad RPCs can retain an insufficient-balance rejection after funding. Only
 * rebroadcast the exact journaled transaction, under the caller's nonce lock,
 * to an explicitly configured recovery endpoint. This never signs a replacement.
 * Both endpoints must now see sufficient balance and the original unused nonce. */
export async function rebroadcastFundedOperation(primary:PublicClient,recovery:PublicClient,job:{raw:Hex;hash:Hex},owner:Address){
 if(keccak256(job.raw)!==job.hash)throw Error('Recovery transaction hash mismatch');
 const tx=parseTransaction(job.raw),signer=await recoverTransactionAddress({serializedTransaction:job.raw as TransactionSerialized});
 if(tx.chainId!==10143||signer.toLowerCase()!==owner.toLowerCase()||tx.nonce===undefined||!tx.gas)
  throw Error('Recovery transaction identity mismatch');
 const fee=tx.maxFeePerGas??tx.gasPrice;if(fee===undefined)throw Error('Recovery transaction fee is missing');
 const required=tx.gas*fee+(tx.value??0n);
 for(const client of [primary,recovery]){
  if(await client.getChainId()!==10143)throw Error('Recovery RPC network mismatch');
  const [balance,latest,pending]=await Promise.all([client.getBalance({address:owner}),
   client.getTransactionCount({address:owner,blockTag:'latest'}),client.getTransactionCount({address:owner,blockTag:'pending'})]);
  if(balance<required||latest!==tx.nonce||pending!==tx.nonce)return false;
 }
 const hash=await recovery.sendRawTransaction({serializedTransaction:job.raw});
 if(hash!==job.hash)throw Error('Recovery RPC returned another transaction hash');
 return true;
}
