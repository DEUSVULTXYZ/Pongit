import test from 'node:test';
import assert from 'node:assert/strict';
import {toHex} from 'viem';
import {independentRuntime} from '../relayer/src/independent-runtime';
const address=(n:number)=>toHex(n,{size:20});
const raw={chainId:10143,rulesVersion:14,production:false,status:'sealed',hub:address(1),family:address(2),lobby:address(3),ratings:address(4),settlement:address(5),vault:address(6),market:address(7),profiles:address(8),privateData:address(9),pressureSigner:address(10),resultVerifier:address(11),admissionSigner:address(12),arenas:[13,14,15].map(app=>({app:address(app)})),genesis:1,createdAt:'2026-09-21'};
test('private reusable adapters cannot become production by replacing a manifest',()=>{
 const env={PONG_INDEPENDENT_REUSABLE_QUALIFICATION:'isolated-vps'};
 assert.equal(independentRuntime(raw,env).rulesVersion,14);
 assert.throws(()=>independentRuntime({...raw,production:true},env),/not yet qualified/);
 assert.throws(()=>independentRuntime(raw,{}),/not yet qualified/);
});
test('reviewed adapter needs matching nonzero evidence and a verified migration source',()=>{
 const evidence=toHex(1,{size:32}),manifest={...raw,production:true,qualificationEvidence:evidence,migrationHash:toHex(2,{size:32})};
 const env={PONG_INDEPENDENT_REUSABLE_RUNTIME:'reviewed-release',PONG_INDEPENDENT_RELEASE_EVIDENCE:evidence,PONG_INDEPENDENT_SNAPSHOT:'/metadata/snapshot.json'};
 assert.equal(independentRuntime(manifest,env).lobby,address(3));
 for(const change of [{production:false},{status:'deploying'},{qualificationEvidence:toHex(3,{size:32})},{migrationHash:'0x'},{migrationHash:toHex(0,{size:32})}])assert.throws(()=>independentRuntime({...manifest,...change},env));
 for(const change of [{PONG_INDEPENDENT_RELEASE_EVIDENCE:undefined},{PONG_INDEPENDENT_RELEASE_EVIDENCE:toHex(0,{size:32})},{PONG_INDEPENDENT_SNAPSHOT:undefined}])assert.throws(()=>independentRuntime(manifest,{...env,...change}));
});
