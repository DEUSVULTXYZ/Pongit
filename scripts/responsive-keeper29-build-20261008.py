"""Small admission-only image, exact committed inputs and no network in tests."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='3aaa5c27f549ec455172ef2c5a1220905bd1a078'
parent='sha256:9414d534bc5930795a8b64e707d3e30e25d7fd330a33f285ac9e2dfeb2ae21fa'
source=root/'keeper29-source-3aaa5c2.tar.gz';meta=json.loads(source.with_suffix('.json').read_text())
assert meta['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==meta['sha256']
context=root/'keeper29-build-3aaa5c2';output=root/'build-keeper29.json';assert not context.exists() and not output.exists()
v=os.statvfs('/');disk=100*(v.f_blocks-v.f_bfree)/(v.f_blocks-v.f_bfree+v.f_bavail);assert disk<80,('Scoped cleanup required',disk)
assert int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))>1048576
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
files=['scripts/agent-reusable-step.ts','shared/agent-keeper-rpc.ts','shared/agent-keeper-role.ts','shared/hub-lease.ts','relayer/src/rpc-scheduler.ts','tests/agent-keeper-rpc.test.ts','tests/agent-keeper-role.test.ts']
assert set(files)==set(meta['files'])
for p in files:assert hashlib.sha256((context/p).read_bytes()).hexdigest()==meta['files'][p]
(context/'Dockerfile').write_text('FROM '+parent+'\n'+''.join('COPY --chown=node:node '+p+' /app/'+p+'\n' for p in files))
report={'source':commit,'parent':parent,'files':meta['files'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'diskBefore':disk,'passed':False}
output.write_text(json.dumps(report,indent=2))
try:
 with (root/'build-keeper29.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--memory-swap','512m','--cpu-quota','50000','--label','org.opencontainers.image.revision='+commit,'-t','pongit:responsive-keeper29-3aaa5c2','.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect','pongit:responsive-keeper29-3aaa5c2']))[0]['Id']
 with (root/'build-keeper29-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-keeper29-tests','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5',report['image'],'node','--import','tsx','--test',*files[-2:]],stdout=log,stderr=subprocess.STDOUT,timeout=90,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
