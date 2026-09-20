import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,zeroAddress,zeroHash,type Address} from 'viem';
import {independentRules,independentControlArgs} from '../shared/independent-rules';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
import {initial} from '../shared/physics-v2';

const address=(n:number)=>('0x'+n.toString(16).padStart(40,'0')) as Address;
const raw={chainId:10143,hub:address(1),family:address(2),lobby:address(3),ratings:address(4),settlement:address(5),vault:address(6),market:address(7),profiles:address(8),privateData:address(9),pressureSigner:address(10),arenas:[11,12,13].map(i=>({app:address(i)})),genesis:1700000000,createdAt:'2026-09-20T00:00:00Z'};
test('historical manifests keep their ABI while unknown versions fail closed',()=>{
 assert.equal(publicIndependentManifest(raw).rulesVersion,4);
 const current=publicIndependentManifest({...raw,rulesVersion:12,privateKey:'excluded'}),r=independentRules(current);
 assert.equal(r.permissionDomain,'PONGIT Pooled Arena');assert(r.arena.some(x=>x.type==='function'&&x.name==='submitRandomness'));
 assert(!r.settlement.some(x=>x.type==='function'&&String(x.name)==='checkpointReady'));
 assert(!JSON.stringify(current).includes('excluded'));
 for(const version of [0,9,11,'12',15])assert.throws(()=>publicIndependentManifest({...raw,rulesVersion:version}));
 assert.equal(independentRules({}).permissionDomain,'PONGIT Arena Revocation');
});
test('reusable human rules require public authority references and explicit epoch-bound controls',()=>{
 assert.throws(()=>publicIndependentManifest({...raw,rulesVersion:14}));
 const m=publicIndependentManifest({...raw,rulesVersion:14,resultVerifier:address(30),admissionSigner:address(31),admissionKey:'excluded'});
 const r=independentRules(m);assert.equal(r.permissionDomain,'PONGIT Reusable Arena');
 assert(!JSON.stringify(m).includes('excluded'));
 const input=r.arena.find(x=>x.type==='function'&&x.name==='input')!;assert.equal(input.type,'function');
 if(input.type==='function')assert.deepEqual(input.inputs.slice(0,2).map(x=>x.name),['epoch','id']);
 assert.deepEqual(independentControlArgs(14,7n,[99n,1,2n,1000n]),[7n,99n,1,2n,1000n]);
 assert.deepEqual(independentControlArgs(13,7n,[99n,1,2n,1000n]),[99n,1,2n,1000n]);
 assert.throws(()=>independentControlArgs(14,0n,[99n]));assert.throws(()=>independentControlArgs(14,7n,[]));
});
test('readiness is explicit to rules13 without changing historical countdown permissions',()=>{
 const legacy=independentRules(publicIndependentManifest({...raw,rulesVersion:12}));
 const ready=independentRules(publicIndependentManifest({...raw,rulesVersion:13}));
 assert(!legacy.arena.some(x=>x.type==='function'&&String(x.name)==='confirmReady'));
 for(const name of ['confirmReady','cancelUnready','readiness','submitRandomness'])assert(ready.arena.some(x=>x.type==='function'&&x.name===name));
 assert.equal(ready.permissionDomain,legacy.permissionDomain);assert.equal(ready.events,true);
});
test('rules12 reads use the packed getter at the same pinned Monad block',async()=>{
 const m=publicIndependentManifest({...raw,rulesVersion:12}),abi=independentRules(m).arena;
 const getter=abi.find(x=>x.type==='function'&&x.name==='getSnapshot')! as any;
 const header=[10n,5n,2n,address(20),address(21),address(21),zeroAddress,100n,0n,3n,4n,0n,initial(zeroHash)] as const;
 const encoded=encodeAbiParameters([{type:'tuple',components:getter.outputs.map((x:any,i:number)=>({...x,name:`f${i}`}))},{type:'uint256[8]'},{type:'uint256'},{type:'uint256'}],[header,[0n,0n,0n,0n,0n,0n,0n,0n],0n,0n]);
 const base:any={readContract:async(o:any)=>{assert.equal(o.blockNumber,100n);assert.equal(o.functionName,'chaosState');assert.equal(o.address,m.arenas[0].app);return encoded;}};
 const r=independentReader(base,m,100n),result=await r.snapshot(m.arenas[0].app,10n);assert.equal(result[0],10n);assert.equal(result[9],3n);
 await assert.rejects(r.snapshot(address(99),10n),/Unknown arena/);
});
