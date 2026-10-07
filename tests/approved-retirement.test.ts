import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,parseAbi,zeroHash} from 'viem';
import {approvedRetirementGuard,type ApprovedRetirement} from '../shared/approved-retirement';
const app='0x0000000000000000000000000000000000000001',authority='0x0000000000000000000000000000000000000002';
const other='0x0000000000000000000000000000000000000003';
const abi=parseAbi(['function closeReusableArena(address)','function forceClose(address,bytes32)']);
const data=encodeFunctionData({abi,functionName:'closeReusableArena',args:[app]});
const approval=():ApprovedRetirement=>({evidence:`0x${'12'.repeat(32)}`,deadline:Date.now()+60000,arenas:[{app,authority,epoch:7n}]});
test('manual retirement admits only exact normal closure and canonical epoch/authority',async()=>{
 let reads=0;const guard=approvedRetirementGuard(async()=>{reads++;return {epoch:7n,status:1,beneficiary:authority};},approval());
 assert.equal(await guard(authority,data),true);assert.equal(reads,1);
 assert.equal(await guard(other,data),false);
 assert.equal(await guard(authority,encodeFunctionData({abi,functionName:'closeReusableArena',args:[other]})),false);
 assert.equal(await guard(authority,encodeFunctionData({abi,functionName:'forceClose',args:[app,zeroHash]})),false);
 assert.equal(await guard(authority,`${data}00`),false);assert.equal(reads,1);
});
test('manual retirement rejects reopened, closing and foreign-beneficiary epochs',async()=>{
 for(const d of [{epoch:8n,status:1,beneficiary:authority},{epoch:7n,status:2,beneficiary:authority},{epoch:7n,status:1,beneficiary:other}] as const)
  await assert.rejects(approvedRetirementGuard(async()=>d,approval())(authority,data));
});
test('manual retirement requires bounded evidence and fails closed on reads',async()=>{
 const read=async()=>{throw Error('unavailable');};
 assert.throws(()=>approvedRetirementGuard(read,{...approval(),evidence:zeroHash}));
 assert.throws(()=>approvedRetirementGuard(read,{...approval(),deadline:Date.now()-1}));
 assert.throws(()=>approvedRetirementGuard(read,{...approval(),deadline:Date.now()+3*60*60*1000}));
 await assert.rejects(approvedRetirementGuard(read,approval())(authority,data),/unavailable/);
});
