"""Read-only canonical retirement and source-finality observation."""
import datetime, json, pathlib, subprocess

root = pathlib.Path('/opt/pongit/releases/reship-all-20261007')
retirement = json.loads((root / 'evidence/retirement.json').read_text())
agents = json.loads((root / 'source/agents.json').read_text())
human = json.loads((root / 'source/human.json').read_text())
script = """
import assert from 'node:assert/strict';
import {createPublicClient,http} from 'viem';
import {readHubDelegation} from './shared/rooms-hub.ts';
import {abi as verifierAbi} from './shared/abi-independent-PublishedResultVerifier.ts';
import {agentPublishedRatingsAbi as agentAbi} from './shared/abi-AgentPublishedRatings.ts';
import {abi as humanAbi} from './shared/abi-independent-PublishedRatings.ts';
const input=INPUT;
const client=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:20000})});
const block=await client.getBlock();
const read=(address,abi,functionName,args=[])=>client.readContract({address,abi,functionName,args,blockNumber:block.number});
const arenas=[];
for(const row of input.retirement.arenas){
 const d=await readHubDelegation(client,input.agents.hub,row.app,block.number);
 const root=await read(row.verifier,verifierAbi,'finalizedRoots',[row.app,BigInt(row.epoch)]);
 const exact=d.status===0&&String(d.epoch)===row.epoch&&root[0]===row.root[2]&&String(root[1])===String(row.root[1]);
 arenas.push({app:row.app,epoch:row.epoch,status:d.status,exact});
}
const ledgers=[];
for(const [kind,manifest,abi] of [['agent',input.agents,agentAbi],['human',input.human,humanAbi]]){
 const count=await read(manifest.ratings,abi,'count');let final=0;
 for(let offset=0n;offset<count;offset+=32n){const [page]=await read(manifest.ratings,abi,'resultPage',[offset,32n]);final+=page.filter(e=>e.finality).length;}
 ledgers.push({kind,count:String(count),final});
}
assert.equal((await client.getBlock({blockNumber:block.number})).hash,block.hash);
console.log(JSON.stringify({block:String(block.number),hash:block.hash,arenas,ledgers,released:arenas.every(a=>a.exact),allFinal:ledgers.every(l=>BigInt(l.count)===BigInt(l.final))}));
""".replace('INPUT', json.dumps({'retirement': retirement, 'agents': agents, 'human': human}))
result = subprocess.run(['docker', 'exec', '-i', '-w', '/app', 'pongit-arcade-five-reader-1', 'node', '--import', 'tsx', '--input-type=module'], input=script, text=True, capture_output=True, timeout=120)
if result.returncode:
    raise RuntimeError('Read-only source observation failed; inspect the bounded diagnostic without printing secrets: ' + result.stderr.splitlines()[0][:160])
report = json.loads(result.stdout.strip().splitlines()[-1])
report['at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
path = root / 'evidence' / ('source-observation-' + datetime.datetime.now(datetime.timezone.utc).strftime('%H%M%S') + '.json')
path.write_text(json.dumps(report, indent=2))
print(json.dumps({'path': str(path), **report}))
