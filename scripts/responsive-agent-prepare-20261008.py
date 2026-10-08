"""Prepare responsive modules while the current public tournament finishes.

This dispatcher cannot import, open, close or retire an arena. The only writer
uses the original operator database and nonce authority.
"""
import copy,hashlib,json,os,pathlib,shutil,subprocess,sys
os.umask(0o077)
root=pathlib.Path('/opt/pongit/releases/responsive-20261008')
previous=pathlib.Path('/opt/pongit/releases/reship-repeat-20261007')
action=sys.argv[1];assert action in ['audit','prepare']
build=json.loads((root/'build-runtime-1.json').read_text());assert build['passed']
source=json.loads((root/'source/agents.json').read_text());human=json.loads((root/'source/human.json').read_text())
assert source['pool'].lower()=='0x6b09eb398668cb38db5d3a7dd857c33a371ac308'
agents=root/'agents'
for name in ['metadata','evidence','secrets','state','diagnostics']:
    p=agents/name;p.mkdir(mode=0o700,parents=True,exist_ok=True);os.chown(p,1000,1000)
metadata=agents/'metadata'
for source_path,name in [(root/'source/agents.json','source-manifest.json'),(previous/'agents/evidence/agent-reusable-index.json','source-agent-index.json'),
        (previous/'agents/metadata/ratings-empty-seed-audit.json','predecessor-ratings-audit.json')]:
    dst=metadata/name
    if not dst.exists():shutil.copy2(source_path,dst);dst.chmod(0o644)
    assert dst.read_bytes()==source_path.read_bytes()
c=json.loads((previous/'agents/prepare-runtime-2.json').read_text());s=c['services']['qualification']
s['image']=build['image'];s['restart']='no';s['mem_limit']='512m';s['cpus']=.75
e=s['environment'];e.pop('PONG_RETIRED_TOURNAMENT',None)
e.update(PONG_REUSABLE_AGENT_PREFIX='reusable-agents-20261008-1',PONG_SOURCE_COMMIT=build['sourceCommit'],PONG_CONTINUING_STAGE='prepare',
    PONG_CONTINUING_AGENT_MIGRATION='authorized-closed-source-testnet',PONG_REUSABLE_RULES='17',PONG_REUSABLE_HUB_V3='isolated-testnet',
    PONG_HOUSE_POLICY='progressive-v1',PONG_REUSABLE_ARENA_COUNT='8',PONG_HUMAN_APPS=','.join(a['app'] for a in human['arenas']))
s['volumes']=[str(agents/'secrets')+':/secrets',str(metadata)+':/metadata:ro',str(agents/'state')+':/state',
    str(agents/'evidence')+':/app/artifacts/reusable-candidate',str(agents/'diagnostics')+':/diagnostics',
    str(root/'artifacts/contracts/out')+':/app/contracts/out:ro','/opt/pongit/secrets/rooms/lifecycle.json:/run/operator.json:ro']
if action=='audit':
    seconds=600
    s['volumes'] += [str(metadata)+':/audit-output',str(pathlib.Path('/opt/pongit/releases/sync-public-214c95a/sync-contracts-f4f8fef/out/ContinuingAgentRatings.sol/ContinuingAgentRatings.json'))+':/old-artifact.json:ro']
    command=['scripts/audit-agent-rating-continuation.ts',source['ratings'],'/metadata/predecessor-ratings-audit.json','/old-artifact.json','/audit-output/ratings-empty-seed-audit.json']
    assert not (metadata/'ratings-empty-seed-audit.json').exists()
else:
    audit=json.loads((metadata/'ratings-empty-seed-audit.json').read_text());assert audit['complete'] and audit['noSeeds'] and audit['ratings'].lower()==source['ratings'].lower()
    backup=root/'backup-preparation';proof=json.loads((backup/'off-vps.json').read_text())
    assert proof['verified'] and proof['manifestSha256']==hashlib.sha256((backup/'manifest.json').read_bytes()).hexdigest()
    seconds=1200;command=['scripts/migrate-reusable-agents.ts']
    assert not (agents/'secrets/deployment.json').exists()
s['command']=['timeout','--signal=TERM','--kill-after=30',str(seconds),'node','--import','tsx',*command]
path=root/('agent-'+action+'-runtime-1.json')
with path.open('x') as f:json.dump(c,f)
name='pongit-responsive-agent-'+action+'-20261008-1'
subprocess.run(['docker','compose','-p','pongit-responsive-agent-prepare','-f',str(path),'run','-d','--no-deps','--name',name,'qualification'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'started':name,'scope':action,'timeoutSeconds':seconds,'publicSource':source['pool'],'import':False,'openings':0}))
