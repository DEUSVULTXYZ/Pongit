"""Read-only, canonical public source snapshot for the second reship."""
import datetime
import json
import pathlib
import subprocess
import sys

root = pathlib.Path('/opt/pongit/releases/responsive-20261008')
label = sys.argv[1]
assert label in ['initial', 'drained', 'imported', 'progress']
if label=='progress': label+='-'+datetime.datetime.now(datetime.timezone.utc).strftime('%H%M%S')
out = root / ('inventory-' + label + '.json')
assert not out.exists()
a = json.loads((root / 'source/agents.json').read_text())
h = json.loads((root / 'source/human.json').read_text())
script = '''
import assert from 'node:assert/strict';
import {createPublicClient,http,formatEther} from 'viem';
import {Pool} from 'pg';
import {readHubDelegation} from './shared/rooms-hub.ts';
import {reusableAgentPoolAbi as p} from './shared/abi-ReusableAgentPool.ts';
import {agentTournamentsAbi as b} from './shared/abi-AgentTournaments.ts';
import {agentChallengesAbi as q} from './shared/abi-AgentChallenges.ts';
import {agentPublishedRatingsAbi as ar} from './shared/abi-AgentPublishedRatings.ts';
import {abi as l} from './shared/abi-independent-ReusableEventsLobby.ts';
const {a,h}=INPUT;
const c=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:20000})});
const block=await c.getBlock();
const read=(address,abi,functionName,args=[])=>c.readContract({address,abi,functionName,args,blockNumber:block.number});
const lanes=[];for(let i=0;i<5;i++)lanes.push(await read(a.pool,p,'laneRecord',[i]));
const books=await read(a.tournaments,b,'count');const book=await read(a.tournaments,b,'tournament',[books]);
const fixtures=[];for(let i=0;i<(book.league?28:7);i++)fixtures.push(await read(a.tournaments,b,'fixture',[books,i]));
const humanSlots=[await read(h.lobby,l,'slot',[0n]),await read(h.lobby,l,'slot',[1n])];
const arenas=[];for(const [kind,m,authority]of [['agent',a,a.pool],['human',h,h.lobby]])for(const x of m.arenas){
 const d=await readHubDelegation(c,a.hub,x.app,block.number);arenas.push({kind,authority,app:x.app,epoch:d.epoch,status:d.status,batches:d.batchIndex,expiresAt:d.expiresAt});
}
const balances=[];for(const address of ['0x369158ac444278541322643e46e0d5b45ac21c4c','0x03CaceFD5522f27Ee20322aAA03E76745518FAd1','0xbeeb456231E970aC08420488a2dB91Bfe257686A'])balances.push({address,mon:formatEther(await c.getBalance({address,blockNumber:block.number}))});
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:1});
const pendingEngineJobs=(await db.query("SELECT count(*)::int AS n FROM agent_pool.engine_jobs WHERE status='pending'")).rows[0].n;await db.end();
assert.equal((await c.getBlock({blockNumber:block.number})).hash,block.hash);
console.log(JSON.stringify({at:new Date().toISOString(),block:block.number,blockHash:block.hash,pool:a.pool,lobby:h.lobby,lanes,humanSlots,arenas,
 results:await read(a.pool,p,'nonce'),ratings:await read(a.ratings,ar,'count'),requests:await read(a.challenges,q,'count'),books,book,resolved:fixtures.filter(f=>f.resolved).length,pendingEngineJobs,balances},(_,v)=>typeof v==='bigint'?String(v):v));
'''.replace('INPUT', json.dumps({'a': a, 'h': h}))
r = subprocess.run(['docker', 'exec', '-i', '-w', '/app', 'pongit-arcade-five-reader-1', 'node', '--import', 'tsx', '--input-type=module'], input=script, text=True, capture_output=True, timeout=180)
if r.returncode:
    raise RuntimeError('Read-only canonical observation failed; no transaction submitted')
d = json.loads(r.stdout.strip().splitlines()[-1])
out.write_text(json.dumps(d, indent=2))
print(json.dumps({k: v for k, v in d.items() if k not in ['book', 'lanes', 'arenas']}))
