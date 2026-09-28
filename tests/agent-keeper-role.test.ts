import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi,type Abi} from 'viem';
import {keeperRolePolicy} from '../shared/agent-keeper-role';
const pool='0x1111111111111111111111111111111111111111',arena='0x2222222222222222222222222222222222222222';
const abi=parseAbi(['function openReusableArena(address app) payable','function closeReusableArena(address app)','function admitChallenge()','function setAdmissions(bool enabled)']);
const contracts={pool:{address:pool,abi}} as const;
const call=(fn:string,args:any[]=[])=>encodeFunctionData({abi:abi as Abi,functionName:fn,args});
test('maintenance can rotate within funding scope but cannot admit or administer',()=>{
 const check=keeperRolePolicy('maintenance',contracts,10n);
 check(pool,call('openReusableArena',[arena]),10n);check(pool,call('closeReusableArena',[arena]),0n);
 assert.throws(()=>check(pool,call('openReusableArena',[arena]),11n),/value/);
 assert.throws(()=>check(pool,call('closeReusableArena',[arena]),1n),/value/);
 assert.throws(()=>check(pool,call('admitChallenge'),0n),/role/);
 assert.throws(()=>check(pool,call('setAdmissions',[true]),0n),/role/);
});
test('admission and archive roles cannot use maintenance powers or other targets',()=>{
 const check=keeperRolePolicy('admission',contracts,0n);check(pool,call('admitChallenge'),0n);
 for(const role of ['admission','archive'] as const){
  const c=keeperRolePolicy(role,contracts,0n);
  assert.throws(()=>c(pool,call('closeReusableArena',[arena]),0n),/role/);
  assert.throws(()=>c(arena,call('admitChallenge'),0n),/role/);
 }
 assert.throws(()=>check(pool,`${call('admitChallenge')}00`,0n),/canonical/);
});
