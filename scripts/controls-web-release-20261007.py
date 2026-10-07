"""Compatible web-only release. No gameplay service, database or chain writes."""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, sys, tarfile

root=pathlib.Path('/opt/pongit/releases/controls-access-1c56d73')
current=pathlib.Path('/opt/pongit/releases/reship-all-20261007')
canonical=pathlib.Path('/opt/pongit/releases/arcade-d2c6033/five-runtime/compose.json')
live=current/'live/agent-compose.json'
def load(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,v): p.write_text(json.dumps(v,indent=2))
action=sys.argv[1]
if action=='build':
    stat=os.statvfs('/');used=100*(stat.f_blocks-stat.f_bfree)/(stat.f_blocks-stat.f_bfree+stat.f_bavail)
    assert used<80, ('Offload verified obsolete build inputs first',used)
    ctx=root/'source';assert not ctx.exists();ctx.mkdir()
    with tarfile.open(root/'source.tar.gz') as archive: archive.extractall(ctx,filter='data')
    shutil.copy2(current/'build-source/Dockerfile.web',ctx/'Dockerfile.web')
    for name in ['agent-pool.json','agent-pool-release-review.json','agent-reusable-index.json','independent.json']:
        shutil.copy2(current/'build-source/deployments'/name,ctx/'deployments'/name)
    manifest=load(current/'live/metadata/manifest.json')
    manifest.update(enabled=True,tournamentsEnabled=True)
    write(ctx/'deployments/agent-pool.json',manifest)
    assert manifest['pool'].lower()=='0x89906fadc63704b003c5e5ca8e090f4dca757902'
    report={'source':'1c56d73','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha256':sha(root/'source.tar.gz'),'diskBefore':used,'passed':False}
    assert not (root/'build.json').exists();write(root/'build.json',report)
    tag='pongit:controls-access-1c56d73'
    with (root/'build.log').open('w') as log:
        result=subprocess.run(['docker','build','--memory','1800m','--cpu-quota','150000','-f','Dockerfile.web','--target','web','-t',tag,
            '--build-arg','NEXT_PUBLIC_API_URL=https://pongit.xyz/api','--build-arg','NEXT_PUBLIC_WS_URL=wss://pongit.xyz/ws',
            '--build-arg','NEXT_PUBLIC_RP_ID=pongit.xyz','--build-arg','PONG_REQUIRE_AGENT_POOL_MANIFEST=true','.'],cwd=ctx,stdout=log,stderr=subprocess.STDOUT,timeout=900)
    report.update(passed=result.returncode==0,finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),logSha256=sha(root/'build.log'))
    if report['passed']: report['image']=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['Id']
    write(root/'build.json',report);print(json.dumps(report));assert report['passed']
elif action=='backup':
    backup=root/'backup-before';assert not backup.exists();backup.mkdir(mode=0o700)
    shutil.copy2(canonical,backup/'canonical.private.json');shutil.copy2(live,backup/'live.private.json')
    (backup/'runtime.private.json').write_bytes(subprocess.check_output(['docker','inspect','pongit-arcade-five-arcade-web-1']))
    write(backup/'manifest.json',{p.name:{'sha256':sha(p),'bytes':p.stat().st_size} for p in backup.iterdir()})
    print(json.dumps({'backup':str(backup),'manifestSha256':sha(backup/'manifest.json')}))
elif action in ['deploy','rollback']:
    assert not (root/(action+'.json')).exists(), 'Preserve and inspect the previous action'
    build=load(root/'build.json');assert build['passed']
    backup=root/'backup-before';proof=load(backup/'off-vps.json')
    assert proof['verified'] and proof['manifestSha256']==sha(backup/'manifest.json')
    before=load(backup/'canonical.private.json');config=load(canonical);other=load(live)
    expected=before['services']['arcade-web']['image'] if action=='deploy' else build['image']
    target=build['image'] if action=='deploy' else before['services']['arcade-web']['image']
    assert config['services']['arcade-web']['image']==expected and other['services']['arcade-web']['image']==expected
    for item in [config,other]: item['services']['arcade-web']['image']=target
    write(canonical,config);write(live,other)
    subprocess.run(['docker','compose','-p','pongit-arcade-five','-f',str(canonical),'up','-d','--no-deps','arcade-web'],check=True)
    result={'action':action,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'1c56d73','image':target,'previous':expected}
    assert not (root/(action+'.json')).exists();write(root/(action+'.json'),result);print(json.dumps(result))
else: raise ValueError('Unknown action')
