import test from 'node:test';
import assert from 'node:assert/strict';
import {independentProvisioningScope} from '../shared/independent-provisioning';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {LEGACY_HOSTED_HUB} from '../shared/hosted-control';
const app='0x0000000000000000000000000000000000000001',signer='0x0000000000000000000000000000000000000002';
const manifest=()=>({hub:NO_LEASE_HUB,rulesVersion:14,hostedProvisioning:'owner-consent-v1',provisioningOwner:signer,arenas:[{app,runtimeHash:'0x'+'11'.repeat(32)}]});
test('human v3 requires pinned hosting consent and code; legacy remains unsigned',()=>{
 assert.deepEqual(independentProvisioningScope(manifest(),app,1n,signer),{hub:NO_LEASE_HUB,app,epoch:1n,owner:signer,runtimeHash:manifest().arenas[0].runtimeHash});
 assert.equal(independentProvisioningScope({hub:LEGACY_HOSTED_HUB},app,1n),undefined);
 for(const patch of [{hostedProvisioning:undefined},{rulesVersion:13},{provisioningOwner:app},{arenas:[]},{arenas:[{app,runtimeHash:'0x'+'00'.repeat(32)}]}])
  assert.throws(()=>independentProvisioningScope({...manifest(),...patch},app,1n,signer));
 assert.throws(()=>independentProvisioningScope(manifest(),app,0n,signer));
 assert.throws(()=>independentProvisioningScope(manifest(),app,1n));
 assert.throws(()=>independentProvisioningScope({...manifest(),hub:LEGACY_HOSTED_HUB},app,1n,signer));
});
