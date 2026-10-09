"""Small reader-only image, exact committed inputs and no network in tests."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='1bbb9defb603f8942ddaf8badad9ce78f70befa5'
parent='sha256:3cb5ca03d5fd3f58723c3e33c045eb06e6e9b91459df3df3354343e1163a60a9'
source=root/'notifications43-source-1bbb9de.tar.gz';meta=json.loads(source.with_suffix('.json').read_text())
assert meta['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==meta['sha256']
context=root/'notifications43-build-1bbb9de';output=root/'build-notifications43.json';assert not context.exists() and not output.exists()
v=os.statvfs('/');disk=100*(v.f_blocks-v.f_bfree)/(v.f_blocks-v.f_bfree+v.f_bavail);assert disk<80,('Scoped cleanup required',disk)
assert int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))>1048576
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
files=['relayer/src/agents/pool-server.ts', 'relayer/src/agents/pool-notifications.ts', 'tests/agent-pool-notifications.test.ts', 'tests/agent-pool-server.test.ts']
assert set(files)==set(meta['files'])
for p in files:assert hashlib.sha256((context/p).read_bytes()).hexdigest()==meta['files'][p]
(context/'Dockerfile').write_text('FROM '+parent+'\n'+''.join('COPY --chown=node:node '+p+' /app/'+p+'\n' for p in files))
report={'source':commit,'parent':parent,'files':meta['files'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'diskBefore':disk,'passed':False}
output.write_text(json.dumps(report,indent=2))
try:
 with (root/'build-notifications43.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--memory-swap','512m','--cpu-quota','50000','--label','org.opencontainers.image.revision='+commit,'-t','pongit:responsive-notifications43-1bbb9de','.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect','pongit:responsive-notifications43-1bbb9de']))[0]['Id']
 with (root/'build-notifications43-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-notifications43-tests','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5',report['image'],'node','--import','tsx','--test','tests/agent-pool-notifications.test.ts','tests/agent-pool-server.test.ts'],stdout=log,stderr=subprocess.STDOUT,timeout=90,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
