// Read only: locate the exact owned interrupted browser fixture, without
// exposing its retained credentials, storage or signed requests.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {monadTestnet} from 'viem/chains';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
const saved=JSON.parse(await readFile('C:/Users/wwwle/.codex/private-backups/pongit/r2seven18hx.json','utf8'));
const m=publicIndependentManifest(JSON.parse(await readFile('artifacts/responsive-20261008-r2/human-public-recovered.json','utf8')));
assert.equal(saved.lobby.toLowerCase(),m.lobby.toLowerCase());assert.equal(saved.stage,2);
const base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:10000})});
const block=await base.getBlock(),r=independentReader(base,m,block.number);
const active=await Promise.all(saved.players.slice(0,2).map((p:any)=>r.lobby('activeMatchOf',[p.address])));
assert.equal(active[0],active[1]);
const ticket=active[0]>0n?await r.lobby('ticketOf',[active[0]]):null;
const last=Object.entries(saved.players[0].session).find(([key])=>key.startsWith('pongit:last-arena:'));
assert(last);const ref=JSON.parse(String(last[1]));
const [record,index]=await Promise.all([r.lobby('ticketOf',[BigInt(ref.id)]),r.ratings('indexOf',[BigInt(ref.id)])]);
const published=index>0n?await r.ratings('entry',[BigInt(ref.id)]):null;
const report={at:new Date().toISOString(),block:block.number,hash:block.hash,lobby:m.lobby,players:saved.players.slice(0,2).map((p:any)=>p.address),active,ticket,ref,record,published};
assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
const output=JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2);
await writeFile('artifacts/qualification/r2seven18/owned-human-state.json',output);console.log(output);
