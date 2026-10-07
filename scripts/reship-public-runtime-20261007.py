"""Guarded public service cutover; preserves the new chain state on rollback."""
import copy, datetime, json, pathlib, subprocess, sys

root = pathlib.Path('/opt/pongit/releases/reship-all-20261007')
live = root / 'live'
action = sys.argv[1]
assert action in ['backends', 'dns', 'index', 'web', 'human-admissions', 'agent-manifest', 'agent-tournaments']
def load(p): return json.loads(pathlib.Path(p).read_text())
def save(p, value):
    p.write_text(json.dumps(value, indent=2)+'\n'); p.chmod(0o600)
def up(project, config, services):
    subprocess.run(['docker','compose','-p',project,'-f',str(config),'up','-d','--no-deps',*services],check=True)

assert load(root/'agents/evidence/public-import-1.json')['passed']
assert load(root/'human/evidence/preservation-audit.json')['passed']
assert load(root/'agents/evidence/public-setup-1.json')['passed']
assert load(root/'human/evidence/initial-open.json')['passed']
assert load(root/'agents/evidence/new-role-funding.json')['passed']
assert load(root/'evidence/retirement.json')['passed']
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
elif action=='dns':
    # The VPS resolver cached absent IPv4 records before fresh Fly apps existed.
    # Cloudflare UDP and exact-hostname TLS were verified before this scoped fix.
    assert not load(live/'metadata/manifest.json')['enabled']
    assert human['services']['relayer']['environment']['PONG_INDEPENDENT_ADMISSION']=='false'
    roles=['reader','sponsor','admission','maintenance','archive','engines']
    for role in roles: agents['services'][role]['dns']=['1.1.1.1','1.0.0.1']
    human['services']['relayer']['dns']=['1.1.1.1','1.0.0.1']
    save(live/'agent-compose.json',agents);save(canonical_agents,agents)
    save(live/'human-runtime.json',human);save(canonical_human,human)
    up('pongit-arcade-five',canonical_agents,roles)
    up('pongit',canonical_human,['relayer'])
elif action=='index':
    build=load(root/'build-index-1.json');assert build['passed']
    assert 'reship-indexer' not in agents['services']
    service=copy.deepcopy(agents['services']['human-v3-indexer'])
    service['image']=build['image'];service['environment']['ENVIO_PG_SCHEMA']='public_reship_20261007'
    agents['services']['reship-indexer']=service
    save(live/'agent-compose.json',agents);save(canonical_agents,agents)
    up('pongit-arcade-five',canonical_agents,['reship-indexer'])
elif action=='web':
    build=load(root/'build-web-1.json');assert build['passed']
    assert load(root/'agents/evidence/public-challenges-1.json')['passed']
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
    challenges=load(root/'agents/evidence/public-challenges-1.json');assert challenges['passed']
    manifest=load(live/'metadata/manifest.json');manifest['enabled']=True
    opening=root/'agents/evidence/public-open-1.json'
    if action=='agent-tournaments': assert opening.exists() and load(opening)['passed']
    manifest['tournamentsEnabled']=opening.exists() and load(opening)['passed']
    save(live/'metadata/manifest.json',manifest);(live/'metadata/manifest.json').chmod(0o644)
    # Both read-only availability and sponsoring validate the boot-time manifest.
    # A graceful restart preserves every already journaled sponsored operation.
    subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical_agents),'restart','reader','sponsor'],check=True)
save(marker,{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'action':action,'passed':True})
print(json.dumps({'action':action,'passed':True}))
