"""Guarded public service cutover; preserves the new chain state on rollback."""
import copy, datetime, json, pathlib, subprocess, sys

root = pathlib.Path('/opt/pongit/releases/responsive-20261008')
live = root / 'live'
action = sys.argv[1]
assert action in ['backends', 'index', 'web', 'human-admissions', 'agent-manifest', 'agent-tournaments']
def load(p): return json.loads(pathlib.Path(p).read_text())
def save(p, value):
    p.write_text(json.dumps(value, indent=2)+'\n'); p.chmod(0o600)
def up(project, config, services):
    subprocess.run(['docker','compose','-p',project,'-f',str(config),'up','-d','--no-deps',*services],check=True)

def agent_proof(name):
    rows=[load(p) for p in (root/'agents/evidence').glob(name+'-[1-3].json')]
    assert any(p.get('passed') for p in rows), 'Missing '+name+' proof'
agent_proof('verify-import')
assert load(root/'human/evidence/preservation-audit.json')['passed']
agent_proof('open-arenas')
assert load(root/'human/evidence/initial-open.json')['passed']
assert load(live/'evidence/retained-roles.json')['passed']
marker=live/'evidence'/('runtime-'+action+'.json'); assert not marker.exists(), 'Inspect the previous action before retrying'
agents=load(live/'agent-compose.json');human=load(live/'human-runtime.json')
canonical_agents=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json')
canonical_human=pathlib.Path('/opt/pongit/releases/human-v3-20261005/human-runtime.json')
if action=='backends':
    assert human['services']['relayer']['environment']['PONG_INDEPENDENT_ADMISSION']=='false'
    manifest=load(live/'metadata/manifest.json');assert not manifest['enabled'] and not manifest['tournamentsEnabled']
    save(canonical_agents,agents);save(canonical_human,human)
    up('pongit-arcade-five',canonical_agents,['reader','sponsor','admission','maintenance','archive','engines'])
    up('pongit',canonical_human,['relayer'])
elif action=='index':
    build=load(root/'build-index-1.json');assert build['passed']
    assert 'responsive-indexer' not in agents['services']
    service=copy.deepcopy(agents['services']['human-v3-indexer'])
    service['image']=build['image'];service['environment']['ENVIO_PG_SCHEMA']='public_responsive_20261008'
    agents['services']['responsive-indexer']=service
    save(live/'agent-compose.json',agents);save(canonical_agents,agents)
    up('pongit-arcade-five',canonical_agents,['responsive-indexer'])
elif action=='web':
    build=load(root/'build-web-1.json');assert build['passed']
    agent_proof('challenges')
    agents['services']['arcade-web']['image']=build['image']
    save(live/'agent-compose.json',agents);save(canonical_agents,agents)
    up('pongit-arcade-five',canonical_agents,['arcade-web'])
elif action=='human-admissions':
    assert load(live/'evidence/runtime-web.json')['action']=='web'
    human['services']['relayer']['environment']['PONG_INDEPENDENT_ADMISSION']='true'
    assert human['services']['relayer']['environment']['ROOMS_ADMISSION_ENABLED']=='false'
    save(live/'human-runtime.json',human);save(canonical_human,human)
    up('pongit',canonical_human,['relayer'])
else:
    agent_proof('challenges')
    manifest=load(live/'metadata/manifest.json');manifest['enabled']=True
    openings=[load(p) for p in (root/'agents/evidence').glob('tournaments-[1-3].json')]
    if action=='agent-tournaments':agent_proof('tournaments')
    manifest['tournamentsEnabled']=any(p.get('passed') for p in openings)
    save(live/'metadata/manifest.json',manifest);(live/'metadata/manifest.json').chmod(0o644)
    # Both read-only availability and sponsoring validate the boot-time manifest.
    # A graceful restart preserves every already journaled sponsored operation.
    subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical_agents),'restart','reader','sponsor'],check=True)
save(marker,{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'action':action,'passed':True})
print(json.dumps({'action':action,'passed':True}))
