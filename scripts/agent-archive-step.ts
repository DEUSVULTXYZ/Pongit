// Bounded Monad maintenance; uses the existing operator nonce journal and lock.
// This reads the published game, never caller-supplied results or engine frames.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {chainTools} from './independent-chain-tools';
import {agentArchiveAbi as abi} from '../shared/abi-AgentResultArchive';
import {agentArcadeAbi as gameAbi} from '../shared/abi-PongAgentArcade';
assert.equal(process.env.PONG_AGENT_ARCHIVE,'dedicated-authorized');
if(!process.env.DATABASE_URL)process.env.DATABASE_URL=`postgresql://pong:${encodeURIComponent(process.env.POSTGRES_PASSWORD!)}@postgres:5432/pong_relayer`;
const m=JSON.parse(await readFile('/secrets/manifest.json','utf8'));
assert.equal(m.app,'0x4cecc7fb9f199fbd91dcc4a6e6ea7156e69247d9');
const t=await chainTools('agent-archive-20260913'),db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:2});
try{
 let archive;try{const saved=JSON.parse(await readFile('/secrets/archive.json','utf8'));assert.equal(saved.app,m.app);assert.equal(saved.chainId,10143);archive=saved.archive;}catch(e){
  if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
  assert(!process.env.PONG_AGENT_OPERATIONS,'Configure the verified archive before starting permanent operations');
  archive=await t.deploy('AgentResultArchive',[m.app]);
  await writeFile('/secrets/archive.json',JSON.stringify({app:m.app,archive,chainId:10143}),{mode:0o600});
 }
 assert.equal((await t.base.readContract({address:archive,abi,functionName:'game'})).toLowerCase(),m.app);
 await db.query('CREATE TABLE IF NOT EXISTS agent_arcade.archive_checks(app text NOT NULL,match_id bigint NOT NULL,result_hash text NOT NULL,checked_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(app,match_id))');
 // New results are archived first. Cycle through every older result as well,
 // so an outage cannot permanently drop games outside a recent LIMIT window.
 const rows=(await db.query(`SELECT m.id,m.result FROM agent_arcade.matches m LEFT JOIN agent_arcade.archive_checks c ON c.app=m.app AND c.match_id=m.id
  WHERE m.app=$1 AND m.status IN ('complete','cancelled') AND m.result IS NOT NULL ORDER BY c.checked_at ASC NULLS FIRST,m.id LIMIT 30`,[m.app])).rows;
 for(const row of rows){
  const current=await t.base.readContract({address:m.app,abi:gameAbi,functionName:'resultHashes',args:[BigInt(row.id)]}) as string;
  const recorded=await t.base.readContract({address:archive,abi,functionName:'recordedHash',args:[BigInt(row.id)]}) as string;
  if(current!==recorded)await t.write(`record-${row.id}-${current.slice(2)}`,archive,abi,'recordMatch',[BigInt(row.id)]);
  await db.query('INSERT INTO agent_arcade.archive_checks(app,match_id,result_hash) VALUES($1,$2,$3) ON CONFLICT(app,match_id) DO UPDATE SET result_hash=$3,checked_at=now()',[m.app,row.id,current]);
 }
 console.log(JSON.stringify({at:new Date().toISOString(),app:m.app,archive,scope:'Permissionless result discovery; no financial contract'}));
}finally{await t.close();await db.end();}
