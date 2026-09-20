import test from 'node:test';
import assert from 'node:assert/strict';
import {toHex,type Address,type Hex} from 'viem';
import {reusableAdmissionDigest,reusableBindingHash,validateReusableAdmission,type ReusableBinding,type ReusableTicket} from '../shared/reusable-admission';
const at=(n:number)=>toHex(n,{size:20}) as Address;
const b:ReusableBinding={id:99n,room:12n,a:at(1),b:at(2),keyA:at(3),keyB:at(4),expiresA:7201n,expiresB:7201n,mode:1,ranked:true,preparedBlock:4n,epoch:7n};
const t:ReusableTicket={authority:at(5),arena:at(6),epoch:7n,sequence:1n,matchId:99n,bindingHash:reusableBindingHash(b),issuedAt:100n,expires:220n,sourceBlock:4n,sourceHash:toHex(5,{size:32}),rules:14n};
const e={chainId:10143,authority:at(5),arena:at(6),issuedDigest:reusableAdmissionDigest(t),sourceHash:t.sourceHash,reservedMatch:99n,hubEpoch:7n,hubStatus:1,hubExpires:7300n,engineEpoch:7n,engineCount:0,now:110n};
test('admission attestation uses the exact Monad-issued binding and pinned domain',()=>{
 assert.equal(t.bindingHash,'0x5eab5bd06874a7d3f419747fd046325b8f15382dfe4a5a756e3020bda172cfca');
 assert.equal(reusableAdmissionDigest(t),'0xd3b24c45c87c148bf92a7990263752e3aa7d52e1a984c4fa9af4ba033b26cb5c');
 const m=validateReusableAdmission(t,b,e);assert.equal(m.domain.chainId,10143);assert.equal(m.domain.verifyingContract,t.arena);assert.equal(m.message,t);
 for(const changed of [{a:at(7)},{keyA:at(8)},{mode:0},{ranked:false},{epoch:8n}])assert.throws(()=>validateReusableAdmission(t,{...b,...changed},e));
 for(const changed of [{chainId:4242},{issuedDigest:toHex(8,{size:32})},{sourceHash:toHex(8,{size:32})},{reservedMatch:98n},{hubEpoch:8n},{hubStatus:2},{hubExpires:1900n},{engineEpoch:8n},{engineCount:1},{now:221n}])assert.throws(()=>validateReusableAdmission(t,b,{...e,...changed}));
 for(const changed of [{matchId:100n},{sequence:2n},{expires:221n},{issuedAt:111n},{rules:13n}])assert.throws(()=>validateReusableAdmission({...t,...changed},b,e));
});
test('an attestation never lets participant, mode or grant changes retain the issued digest',()=>{
 const altered={...b,keyA:at(9)};const falseTicket={...t,bindingHash:reusableBindingHash(altered)};
 assert.notEqual(reusableAdmissionDigest(falseTicket),e.issuedDigest);
 assert.throws(()=>validateReusableAdmission(falseTicket,altered,e));
 const absent={...e,issuedDigest:('0x'+'0'.repeat(64)) as Hex};assert.throws(()=>validateReusableAdmission(t,b,absent));
});
