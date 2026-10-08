"""Explicit bounded phases; continuous source delegations, original nonce journal.

No retirement, cancellation, forceClose or undelegate phase exists. Nothing runs
until the operator selects one exact action and its preserved prerequisites pass.
"""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, sys

os.umask(0o077)
root = pathlib.Path('/opt/pongit/releases/responsive-20261008')
action = sys.argv[1]
attempt = int(sys.argv[2]) if len(sys.argv)>2 else 1
assert 1 <= attempt <= 3
assert action in ['freeze','stop-drained','import','verify-import','open-arenas','challenges','tournaments','human-bind','human-deploy','human-verify','human-open']
roles = ['admission','maintenance','engines','sponsor','archive']

def load(p): return json.loads(pathlib.Path(p).read_text())
def save(p,v):
    p=pathlib.Path(p)
    with p.open('x') as f: json.dump(v,f,indent=2)
    p.chmod(0o600);os.chown(p,1000,1000)
def state(name): return json.loads(subprocess.check_output(['docker','inspect','-f','{{json .State}}',name]))
def stopped():
    for n in [*['pongit-arcade-five-'+r+'-1' for r in roles],'pongit-relayer-1']:
        assert not state(n)['Running'], n
def proof(name):
    matches=[]
    for p in (root/'agents/evidence').glob(name+'-[1-3].json'):
        v=load(p)
        if v.get('passed'): matches.append((p,v))
    assert matches, 'Missing successful '+name+' evidence'
    return max(matches,key=lambda x:x[1]['finishedAt'])
def backup():
    p=root/'backup-drained';b=load(p/'off-vps.json');m=(p/'manifest.json').read_bytes()
    assert b['verified'] and b['manifestSha256']==hashlib.sha256(m).hexdigest()
    at=b.get('checkedAt',b.get('at'))
    assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(at.replace('Z','+00:00'))).total_seconds()<1800
    for name,item in json.loads(m).items():
        f=p/name;assert f.parent==p and f.stat().st_size==item['bytes']
        assert hashlib.sha256(f.read_bytes()).hexdigest()==item['sha256']
    return b
def start(c,role,label,seconds):
    c['services']={role:c['services'][role]};s=c['services'][role]
    s['restart']='no';s.pop('depends_on',None)
    name='pongit-responsive-'+label+'-20261008-'+str(attempt)
    assert subprocess.run(['docker','inspect',name],capture_output=True).returncode!=0
    # Do not overlap a previous attempt of this phase or another migration writer.
    running=subprocess.check_output(['docker','ps','--format','{{.Names}}'],text=True).splitlines()
    assert not any(n.startswith('pongit-responsive-') and any('-'+x+'-' in n for x in ['freeze','import','verify-import','open-arenas','human-deploy','human-verify','human-open']) for n in running)
    path=root/(label+'-runtime-'+str(attempt)+'.json');save(path,c)
    subprocess.run(['docker','compose','-p','pongit-responsive-migration','-f',str(path),'run','-d','--no-deps','--name',name,role],check=True,stdout=subprocess.DEVNULL)
    print(json.dumps({'started':name,'originalTimeoutSeconds':seconds,'delegationClosures':0}))

build=load(root/('build-runtime-current.json' if (root/'build-runtime-current.json').exists() else 'build-runtime-1.json'));assert build['passed']
if action=='stop-drained':
    frozen=proof('freeze')[1]
    assert (datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(frozen['finishedAt'].replace('Z','+00:00'))).total_seconds()<600
    # Run canonical observation immediately before stopping. If a player races
    # the read, a second snapshot must refuse import; no game is cancelled.
    subprocess.run(['python3',str(root/'observe.py'),'drained'],check=True)
    observed=load(root/'inventory-drained.json')
    assert observed['humanSlots']==['0','0'] and observed['pendingEngineJobs']==0
    assert all(x['ref']['id']=='0' for x in observed['lanes'])
    names=[*['pongit-arcade-five-'+r+'-1' for r in roles],'pongit-relayer-1']
    subprocess.run(['docker','stop','--time','30',*names],check=True,stdout=subprocess.DEVNULL)
    states={n:state(n) for n in names};assert all(not s['Running'] and not s['OOMKilled'] for s in states.values())
    save(root/'evidence/stopped-drained.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'states':{n:{'exitCode':s['ExitCode']} for n,s in states.items()},'sourceBlock':observed['block']})
    print(json.dumps({'stopped':len(states),'delegationClosures':0,'requiresFreshCanonicalSnapshot':True}))
elif action in ['freeze','import','verify-import','open-arenas','challenges','tournaments']:
    if action not in ['freeze','challenges','tournaments']: stopped();proof('freeze')
    c=load(root/'agent-prepare-runtime-1.json');s=c['services']['qualification']
    s['image']=build['image'];s['environment']['PONG_SOURCE_COMMIT']=build['sourceCommit']
    current=load('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json')
    # Preparation only needed the operator journal. The cutover verifier also
    # reads the actual source engine queue, on its separate database network.
    s['environment']['AGENT_DATABASE_URL']=current['services']['admission']['environment']['AGENT_DATABASE_URL']
    assert s['environment']['AGENT_DATABASE_URL']
    c.setdefault('networks',{})['source-store']={'external':True,'name':current['networks']['store']['name']}
    s['networks']=list(s['networks'])+['source-store']
    s['volumes'] += [str(root/'agents/evidence')+':/evidence']
    seconds=1800 if action=='import' else 1200
    if action=='import':
        backup()
        # Keep four existing scoped signers and their journals. Never silently
        # generate replacement service identities in a continuity migration.
        for role in ['admission','maintenance','archive','sponsor']:
            mounts=current['services'][role]['volumes']
            key=next(v['source'] for v in mounts if v['target']=='/run/role.json')
            target=root/'agents/secrets'/(role+'.json')
            if not target.exists():shutil.copy2(key,target);target.chmod(0o600);os.chown(target,1000,1000)
            assert target.read_bytes()==pathlib.Path(key).read_bytes()
        s['environment']['PONG_CONTINUING_STAGE']='import'
        script='migrate-reusable-agents.ts';args=[]
    else:
        script='responsive-activate-20261008.ts' if action in ['challenges','tournaments'] else 'responsive-agent-control-20261008.ts';args=[action]
        s['volumes'].append(str(root/script)+':/app/scripts/'+script+':ro')
        s['environment'].update(PONG_RESPONSIVE_AGENTS='public-rules17-20261008',PONG_RESPONSIVE_REPORT='/evidence/'+action+'-'+str(attempt)+'.json')
        if action!='freeze':s['environment']['PONG_RESPONSIVE_FREEZE_PROOF']='/evidence/'+proof('freeze')[0].name
        if action in ['open-arenas','challenges','tournaments']:s['environment']['PONG_RESPONSIVE_IMPORT_PROOF']='/evidence/'+proof('verify-import')[0].name
    s['command']=['timeout','--signal=TERM','--kill-after=30',str(seconds),'node','--import','tsx','scripts/'+script,*args]
    start(c,'qualification',action,seconds)
else:
    stopped();proof('verify-import')
    for name in ['secrets','evidence']:
        p=root/'human'/name;p.mkdir(parents=True,exist_ok=True,mode=0o700);os.chown(p,1000,1000)
    if action=='human-bind':
        snapshot_attempt=int(sys.argv[3]);social_attempt=int(sys.argv[4])
        assert 1<=snapshot_attempt<=4 and 1<=social_attempt<=4
        source={'snapshot':'source-audit-'+str(snapshot_attempt)+'.json','social':'social-audit-'+str(social_attempt)+'.json'}
        backup()
    else:
        source=load(root/'human-evidence/final-snapshot-binding.json');assert source['passed']
    c=load(root/'agent-prepare-runtime-1.json');s=c['services']['qualification']
    s['image']=build['image'];s['environment']['PONG_SOURCE_COMMIT']=build['sourceCommit']
    oldhuman=load('/opt/pongit/releases/human-v3-20261005/human-runtime.json')['services']['relayer']
    e=s['environment'];e.update(PONG_PUBLIC_HUMAN_MIGRATION='public-responsive-human-20261007',
        PONG_INDEPENDENT_MANIFEST='/secrets/manifest.json',PONG_INDEPENDENT_SNAPSHOT='/audit/'+source['snapshot'],
        PONG_HUMAN_SOCIAL_PROOF='/audit/'+source['social'],PONG_HUMAN_SOURCE_DRAIN_PROOF='/audit/drain-proof.json',
        PONG_INDEPENDENT_DATABASE_URL=oldhuman['environment']['PONG_INDEPENDENT_DATABASE_URL'])
    provisioner=next(v['source'] for v in oldhuman['volumes'] if v['target']=='/run/pongit-human-v3')
    oldmanifest=load(pathlib.Path(provisioner)/'manifest.json')
    e['PONG_HOSTED_PROVISIONER']=oldmanifest['provisioningOwner']
    if action=='human-deploy':backup()
    s['volumes']=[str(root/'human/secrets')+':/secrets',str(root/'human/evidence')+':/evidence',str(root/'human-evidence')+':/audit:ro',
        str(root/'artifacts/contracts/out')+':/app/contracts/out:ro','/opt/pongit/secrets/rooms/lifecycle.json:/run/operator.json:ro']
    if action=='human-bind':
        s['volumes'][2]=str(root/'human-evidence')+':/audit'
        s['volumes'] += [str(root/'backup-drained')+':/backup:ro',str(root/'responsive-human-drain-proof-20261008.ts')+':/app/scripts/responsive-human-drain-proof-20261008.ts:ro']
    script={'human-bind':'responsive-human-drain-proof-20261008.ts','human-deploy':'deploy-responsive-human.ts','human-verify':'verify-responsive-human.ts','human-open':'open-public-human-v3.ts'}[action]
    seconds=1800 if action=='human-deploy' else 900
    s['command']=['timeout','--signal=TERM','--kill-after=30',str(seconds),'node','--import','tsx','--input-type=module','-e',
        "import('./scripts/"+script+"').catch(e=>{console.error(JSON.stringify({failed:true,message:String(e.shortMessage||e.message).split('\\n')[0].replace(/0x[\\da-f]{64,}/gi,'[omitted]').slice(0,240)}));process.exit(1)})"]
    start(c,'qualification',action,seconds)
