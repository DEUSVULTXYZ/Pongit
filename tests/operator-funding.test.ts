import test from 'node:test';
import assert from 'node:assert/strict';
import {BaseError,InsufficientFundsError} from 'viem';
import {operatorNeedsFunding} from '../shared/operator-funding';
test('gas rejection remains distinct from a lost response, rate limit or contract revert',()=>{
 assert(operatorNeedsFunding(new BaseError('Failed transaction',{cause:new InsufficientFundsError()})));
 assert(operatorNeedsFunding({name:'RpcRequestError',details:'insufficient balance: cannot cover gas'}));
 assert(operatorNeedsFunding({name:'UnknownRpcError',details:'Signer had insufficient balance'}));
 assert(!operatorNeedsFunding(Error('Response lost after execution')));
 assert(!operatorNeedsFunding({name:'HttpRequestError',message:'HTTP 429'}));
 assert(!operatorNeedsFunding({name:'ContractFunctionRevertedError',message:'insufficient funds in market'}));
 assert(!operatorNeedsFunding({name:'RpcRequestError',details:'RPC unavailable'}));
 const circular:any={name:'Error'};circular.cause=circular;assert(!operatorNeedsFunding(circular));
});
