import {InsufficientFundsError} from 'viem';

/** A gas rejection is not an execution failure and must not retire the nonce. */
export function operatorNeedsFunding(error:unknown){
 let cause=error as {name?:string;message?:string;details?:string;cause?:unknown}|undefined;
 for(let i=0;cause&&i<10;i++,cause=cause.cause as typeof cause){
  if(cause.name==='ExecutionRevertedError'||cause.name==='ContractFunctionRevertedError')return false;
  if(cause instanceof InsufficientFundsError)return true;
  if(['RpcRequestError','UnknownRpcError','TransactionRejectedRpcError'].includes(cause.name??'')
   &&[cause.message,cause.details].some(v=>typeof v==='string'&&/^(insufficient funds|insufficient balance|signer had insufficient balance|exceeds transaction sender account balance)(?:[ .:]|$)/i.test(v)))return true;
 }
 return false;
}
export const operatorFundingMessage='Service gas funding is unavailable. The original operation is retained; no player payment is required.';
