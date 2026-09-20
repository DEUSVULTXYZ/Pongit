import test from 'node:test';
import assert from 'node:assert/strict';
import {toHex,zeroAddress,zeroHash,type Address} from 'viem';
import {reusableAdmissionDigest,type ReusableTicket} from '../shared/reusable-admission';
import {reusableAgentBindingHash,validateReusableAgentAdmission,type ReusableAgentBinding} from '../shared/reusable-agent-admission';
const at=(n:number)=>toHex(n,{size:20}) as Address,code=toHex(123,{size:32});
const b:ReusableAgentBinding={id:99n,epoch:7n,preparedBlock:4n,tournament:0n,a:at(1),b:at(2),mode:1,ranked:false,overtime:false,
 controlA:{codeHash:zeroHash,memoryWord:0n,house:0,key:at(3),expires:7201n},controlB:{codeHash:code,memoryWord:0n,house:3,key:zeroAddress,expires:0n}};
const t:ReusableTicket={authority:at(5),arena:at(6),epoch:7n,sequence:1n,matchId:99n,bindingHash:reusableAgentBindingHash(b),issuedAt:100n,expires:220n,sourceBlock:4n,sourceHash:toHex(5,{size:32}),rules:15n};
const e={chainId:10143,authority:at(5),arena:at(6),issuedDigest:reusableAdmissionDigest(t),sourceHash:t.sourceHash,reservedMatch:99n,hubEpoch:7n,hubStatus:1,hubExpires:7300n,engineEpoch:7n,engineCount:0,now:110n,engineCodeHashA:zeroHash,engineCodeHashB:code};
test('the admission matches the Solidity controller tuple golden vector',()=>{
 assert.equal(reusableAgentBindingHash(b),'0x71b7de9ac1baef9814b0571a0bb27d45e75a721b025ed4cdcbdf979a6c1ec3d3');
 assert.equal(reusableAdmissionDigest(t),'0x7347109fa74117c5134200e8c8749b12999e8b513c555d1980922778883ad1c4');
});
test('the agent bridge binds the full controller, match and current publication epoch',()=>{
 assert.equal(validateReusableAgentAdmission(t,b,e).domain.chainId,10143);
 for(const changed of [{ranked:true},{overtime:true},{tournament:8n},{a:at(9)},{epoch:8n}])assert.throws(()=>validateReusableAgentAdmission(t,{...b,...changed},e));
 for(const changed of [{chainId:4242},{issuedDigest:zeroHash},{engineCodeHashB:zeroHash},{hubStatus:2},{reservedMatch:98n},{hubExpires:530n},{engineCount:1},{engineEpoch:8n},{sourceHash:zeroHash},{now:220n}])assert.throws(()=>validateReusableAgentAdmission(t,b,{...e,...changed}));
});
test('a strategy never gains an external key and a human never gains bot memory',()=>{
 for(const c of [{...b.controlB,key:at(8)},{...b.controlB,expires:500n},{...b.controlB,memoryWord:1n<<192n},{...b.controlB,house:9}]){
  const binding={...b,controlB:c},ticket={...t,bindingHash:reusableAgentBindingHash(binding)};
  assert.throws(()=>validateReusableAgentAdmission(ticket,binding,{...e,issuedDigest:reusableAdmissionDigest(ticket)}));
 }
 const binding={...b,controlA:{...b.controlA,memoryWord:1n}},ticket={...t,bindingHash:reusableAgentBindingHash(binding)};
 assert.throws(()=>validateReusableAgentAdmission(ticket,binding,{...e,issuedDigest:reusableAdmissionDigest(ticket)}));
});
