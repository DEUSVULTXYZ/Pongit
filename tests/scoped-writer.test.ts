import test from 'node:test';
import assert from 'node:assert/strict';
import {writerIdentity,LEGACY_OPERATOR} from '../shared/scoped-writer';
const a='0x1111111111111111111111111111111111111111',b='0x2222222222222222222222222222222222222222';
const scope=(address:typeof a|typeof b|typeof LEGACY_OPERATOR)=>({address,keyFile:'/private/role.json',allowCall:()=>{}});
test('legacy nonce lock and journal names remain unchanged',()=>{
 assert.deepEqual(writerIdentity(LEGACY_OPERATOR),{owner:LEGACY_OPERATOR,lock:'701340',prefix:'independent:',scoped:false});
});
test('new roles share their address lock across instances but not across keys',()=>{
 const one=writerIdentity(a,scope(a)),two=writerIdentity(b,scope(b));
 assert.deepEqual(one,writerIdentity(a,{...scope(a),keyFile:'/another/mount.json'}));
 assert.notEqual(one.lock,two.lock);assert.notEqual(one.prefix,two.prefix);
 assert(BigInt(one.lock)>701340n&&BigInt(one.lock)<2n**63n);
});
test('a scoped role cannot adopt the legacy key or another role',()=>{
 assert.throws(()=>writerIdentity(LEGACY_OPERATOR,scope(LEGACY_OPERATOR)),/dedicated role/);
 assert.throws(()=>writerIdentity(a,scope(b)),/dedicated role/);
});
