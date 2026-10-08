"""Bounded reserve transfer and restart-safe stop of the next tournament."""
import copy,datetime,hashlib,json,os,pathlib,subprocess,sys
os.umask(0o077)
root=pathlib.Path('/opt/pongit/releases/responsive-20261008')
action=sys.argv[1]
assert action in ['fund','drain-next']
if action=='fund':
    c=json.loads(pathlib.Path('/opt/pongit/releases/reship-repeat-20261007/agents/prepare-runtime-2.json').read_text())
    s=c['services']['qualification'];s['image']='sha256:3f5947f149c4a98c90a2f88790cd6044e32ce096e2961cf78fc71ce89ac36f39'
    s['environment']['PONG_RESPONSIVE_RESERVE']='old-admission-100-20261008'
    s['volumes']=['/opt/pongit/secrets/rooms/lifecycle.json:/run/operator.json:ro',str(root/'evidence')+':/evidence',
        str(root/'responsive-reserve-20261008.ts')+':/app/scripts/responsive-reserve-20261008.ts:ro']
    s['restart']='no';s['mem_limit']='384m';s['cpus']=.5
    s['command']=['timeout','--signal=TERM','--kill-after=15','180','node','--import','tsx','scripts/responsive-reserve-20261008.ts']
    os.chown(root/'evidence',1000,1000)
    path=root/'reserve-runtime.json'
    with path.open('x') as f:json.dump(c,f)
    name='pongit-responsive-reserve-20261008-1'
    subprocess.run(['docker','compose','-p','pongit-responsive-reserve','-f',str(path),'run','-d','--no-deps','--name',name,'qualification'],check=True,stdout=subprocess.DEVNULL)
    print(json.dumps({'started':name,'testMon':100,'timeoutSeconds':180}))
else:
    path=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json')
    original=path.read_bytes();c=json.loads(original)
    assert c['services']['admission']['environment'].get('PONG_REUSABLE_AGENT_PREFIX')=='reusable-agents-20261007-2'
    assert c['services']['admission']['environment'].get('PONG_AGENT_TOURNAMENT_DRAIN')!='1'
    rollback=root/'source/admission-before-drain.private.json'
    with rollback.open('xb') as f:f.write(original)
    c['services']['admission']['environment']['PONG_AGENT_TOURNAMENT_DRAIN']='1'
    path.write_text(json.dumps(c,indent=2));path.chmod(0o600)
    subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(path),'up','-d','--no-deps','admission'],check=True)
    (root/'evidence/drain-next.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'sourceSha256':hashlib.sha256(original).hexdigest(),'runtimeSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'scope':'Finish current tournament and challenges; suppress next tournament only','delegationTransactions':0}))
    print(json.dumps({'nextTournamentSuppressed':True,'currentMatchesPreserved':True}))
