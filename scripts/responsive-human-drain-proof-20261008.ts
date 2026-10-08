// Read-only canonical binding of the final social/seed audit and off-VPS backup.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPublicClient,http,keccak256} from 'viem';
import {Pool} from 'pg';
import {independentReader} from '../shared/independent-read';
import {publicIndependentManifest} from '../shared/independent';
import {readHubDelegation} from '../shared/rooms-hub';
assert.equal(process.env.PONG_PUBLIC_HUMAN_MIGRATION,'public-responsive-human-20261007');
const snapshotPath=process.env.PONG_INDEPENDENT_SNAPSHOT!,socialPath=process.env.PONG_HUMAN_SOCIAL_PROOF!;
assert(/^\/audit\/source-audit-[1-4]\.json$/.test(snapshotPath)&&/^\/audit\/social-audit-[1-4]\.json$/.test(socialPath));
const bytes=await readFile(snapshotPath),s=JSON.parse(bytes.toString()),social=JSON.parse(await readFile(socialPath,'utf8'));
assert(s.ready&&s.schema==='responsive-human-ordered-v1'&&social.complete);
assert.equal(social.snapshotHash,keccak256(bytes));assert.equal(social.sourceHash,s.sourceHash);
assert.equal(s.source.lobby.toLowerCase(),'0x71a49c00ba733724cb33d7590134d4ae96426156');
assert.equal(social.blockCommands+social.activeQueues+social.pendingInvitations,0);
const backup=await readFile('/backup/manifest.json'),off=JSON.parse(await readFile('/backup/off-vps.json','utf8'));
assert(off.verified&&off.manifestSha256===createHash('sha256').update(backup).digest('hex'));
assert(Date.now()-Date.parse(off.checkedAt??off.at)<30*60_000);
const c=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:20000})});
const db=new Pool({connectionString:process.env.PONG_INDEPENDENT_DATABASE_URL,max:1});
try{
 assert.equal(await c.getChainId(),10143);
 assert.equal((await c.getBlock({blockNumber:BigInt(s.sourceBlock)})).hash,s.sourceHash);
 const b=await c.getBlock(),m=publicIndependentManifest(s.source),r=independentReader(c,m,b.number);
 assert.equal(String(await r.ratings('count')),s.count);assert.equal(String(await r.ratings('revision')),s.revision);
 assert.equal(await r.ratings('buildGeneration'),0n);
 for(const slot of [0n,1n])assert.equal(await r.lobby('slot',[slot]),0n);
 for(const a of m.arenas){
  assert.equal(await r.lobby('reservedMatch',[a.app]),0n);
  const d=await readHubDelegation(c,m.hub,a.app,b.number);assert(d.status===1&&d.expiresAt===0n);
 }
 const pending=(await db.query("SELECT count(*)::int AS n FROM independent_operations WHERE status IN ('queued','pending')")).rows[0].n;
 assert.equal(pending,0,'Resolve existing commands without cancelling them');
 assert.equal((await c.getBlock({blockNumber:b.number})).hash,b.hash);
 const report={passed:true,at:new Date().toISOString(),sourceLobby:m.lobby,block:String(b.number),blockHash:b.hash,
  admissionsStopped:true,slotsEmpty:true,pendingCommands:pending,offVpsVerified:true,backupSha256:off.manifestSha256,
  snapshot:snapshotPath.split('/').at(-1),social:socialPath.split('/').at(-1),snapshotHash:keccak256(bytes)};
 await writeFile('/audit/drain-proof.json',JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 await writeFile('/audit/final-snapshot-binding.json',JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({passed:true,sourceLobby:m.lobby,block:report.block,delegationClosures:0}));
}finally{await db.end();}
