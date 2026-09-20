import {keccak256,parseTransaction,recoverTransactionAddress,type Address,type Hex,type TransactionSerialized} from 'viem';

export type SavedCreatorTransaction={raw:Hex;hash:Hex;nonce:number;value:boolean};
type Receipt={status:'success'|'reverted';transactionHash:Hex};
type Transport={receipt:(hash:Hex)=>Promise<Receipt|null>;nonce:(owner:Address)=>Promise<number>;
 send:(raw:Hex)=>Promise<Hex>;wait:(hash:Hex)=>Promise<Receipt>};

/** Reconcile one exact zero-value creator transaction. The caller persists the
 * signed bytes BEFORE calling and removes them only after this returns a receipt.
 * An RPC outage must reject receipt(), never be converted to null. */
export async function settleCreatorTransaction(saved:SavedCreatorTransaction,
 expected:{owner:Address;to:Address;data:Hex},transport:Transport):Promise<Receipt>{
 if(keccak256(saved.raw)!==saved.hash)throw Error('Creator journal hash differs');
 const tx=parseTransaction(saved.raw),owner=await recoverTransactionAddress({serializedTransaction:saved.raw as TransactionSerialized});
 if(owner.toLowerCase()!==expected.owner.toLowerCase()||tx.chainId!==10143||tx.to?.toLowerCase()!==expected.to.toLowerCase()
  ||tx.data?.toLowerCase()!==expected.data.toLowerCase()||(tx.value??0n)!==0n||tx.nonce!==saved.nonce)
  throw Error('Saved creator transaction differs from the approved availability call');
 let receipt=await transport.receipt(saved.hash);
 if(!receipt){
  if(await transport.nonce(expected.owner)>saved.nonce)
   throw Error('Creator nonce was consumed but its exact receipt is unavailable. Preserve the journal.');
  try{if(await transport.send(saved.raw)!==saved.hash)throw Error('Unexpected transaction hash');}
  catch{throw Error('Availability submission is uncertain. Preserve the journal; no replacement was signed.');}
  receipt=await transport.wait(saved.hash);
 }
 if(receipt.transactionHash!==saved.hash||!['success','reverted'].includes(receipt.status))throw Error('Creator receipt differs from the saved transaction');
 return receipt;
}
