import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
assert(['private-mocked-services','private-real-testnet'].includes(process.env.CHAOS_WEB_FIXTURE));
const p='deployments/interlude-rooms.json',m=JSON.parse(await readFile(p,'utf8'));
// Deliberately unroutable. Browser fixtures must intercept every game request.
const real=process.env.CHAOS_WEB_FIXTURE==='private-real-testnet'?JSON.parse(await readFile('artifacts/drand/integration-manifests.json','utf8')):null;
if(real)assert.equal(real.game.app,'0x4ace43735d1e5b0aa9b2d54a76ea4ac99089bb91');
Object.assign(m,real?.game||{rulesVersion:6,app:'0x4ace43735d1e5b0aa9b2d54a76ea4ac99089bb91',node:'https://chaos-fixture.invalid'},{releaseReady:false,releaseStatus:process.env.CHAOS_WEB_FIXTURE});
await writeFile(p,JSON.stringify(m,null,2));
const q='deployments/rooms-finance.json',f=JSON.parse(await readFile(q,'utf8'));
f.push(real?.finance||{...f.at(-1),app:m.app,rulesVersion:6,financeId:'events-fixture'});await writeFile(q,JSON.stringify(f,null,2));
