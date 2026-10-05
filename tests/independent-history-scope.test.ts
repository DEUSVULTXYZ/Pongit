import test from 'node:test';
import assert from 'node:assert/strict';
import {toHex} from 'viem';
import {publicIndependentManifest} from '../shared/independent';
import {previousIndependentManifests,independentScope,mergeIndependentRecent} from '../shared/independent-history-scope';
import {independentCspOrigins} from '../shared/independent-csp';
import {NO_LEASE_HUB} from '../shared/hub-lease';
const address=(n:number)=>toHex(n,{size:20});
const raw=(lobby:number)=>({chainId:10143,rulesVersion:14,hub:address(1),family:address(2),lobby:address(lobby),ratings:address(lobby+1),settlement:address(lobby+2),vault:address(lobby+3),market:address(lobby+4),profiles:address(8),privateData:address(9),pressureSigner:address(10),resultVerifier:address(11),admissionSigner:address(12),arenas:[13,14,15].map(app=>({app:address(app)})),genesis:1,createdAt:'2026-10-05'});
test('human migration exposes only approved historic addresses without private metadata',()=>{
 const current=publicIndependentManifest(raw(100)),[old]=previousIndependentManifests([{...raw(200),privateKey:'never serialized',previous:[raw(300)]}],current);
 assert(!('privateKey'in old));assert(!('previous'in old));
 assert.equal(independentScope(current,[old],old.lobby),old);
 assert.equal(independentScope(current,[old]),current);
 assert.throws(()=>independentScope(current,[old],address(300)),/Unknown/);
 assert.throws(()=>independentScope(current,[old],'0x'),/Invalid/);
 assert.throws(()=>previousIndependentManifests([raw(100)],current),/Duplicate/);
 assert.throws(()=>previousIndependentManifests([raw(200),raw(200)],current),/Duplicate/);
 assert.throws(()=>previousIndependentManifests(Array(9).fill(raw(200)),current),/Invalid/);
});
test('identical numeric match ids from different arenas never replace each other',()=>{
 const old={id:'1',lobby:address(200),ref:`10143:${address(13)}:1:1`,endedBlock:'9007199254740995'};
 const next={id:'1',lobby:address(100),ref:`10143:${address(14)}:1:1`,endedBlock:'9007199254740996'};
 const legacy={id:'1',ref:'v4:1',endedBlock:'10',legacy:true};
 assert.deepEqual(mergeIndependentRecent([[old,legacy],[next,legacy]]),[next,old,legacy]);
 assert.equal(mergeIndependentRecent([[old],[{...old,replayAvailability:'pruned'}]])[0].replayAvailability,'pruned');
});
test('human CSP admits exact v3 HTTPS and WebSocket origins and rejects substituted nodes',()=>{
 const m={...raw(100),hub:NO_LEASE_HUB};
 const origins=independentCspOrigins(m).split(' ');
 assert.equal(origins.length,6);assert(origins.every(v=>/^https:\/\/il2-eu-|^wss:\/\/il2-eu-/.test(v)));
 assert.throws(()=>independentCspOrigins({...m,arenas:m.arenas.map(a=>({...a,node:'https://wrong.fly.dev'}))}),/Unapproved/);
 assert.throws(()=>independentCspOrigins({...m,arenas:m.arenas.map(a=>({...a,node:`https://il-${a.app.slice(2,18)}.fly.dev`}))}),/Unapproved/);
 assert(independentCspOrigins(raw(100)).includes('https://il-'));
});
