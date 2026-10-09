"""Small reader-only image, exact committed inputs and no network in tests."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='57ff56575964cb6142ba2abdf7b9e0dc94605870'
parent='sha256:1505bf6eed901a13c122d383ec22c9d0e2336ff72f249e93ca473bdb5010edbf'
source=root/'config39-source-57ff565.tar.gz';meta=json.loads(source.with_suffix('.json').read_text())
assert meta['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==meta['sha256']
context=root/'config39-build-57ff565';output=root/'build-config39.json';assert not context.exists() and not output.exists()
v=os.statvfs('/');disk=100*(v.f_blocks-v.f_bfree)/(v.f_blocks-v.f_bfree+v.f_bavail);assert disk<80,('Scoped cleanup required',disk)
assert int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))>1048576
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
files=['relayer/src/agents/pool-server.ts', 'tests/public-chain-read.test.ts', 'tests/agent-pool-server.test.ts']
assert set(files)==set(meta['files'])
for p in files:assert hashlib.sha256((context/p).read_bytes()).hexdigest()==meta['files'][p]
(context/'Dockerfile').write_text('FROM '+parent+'\n'+''.join('COPY --chown=node:node '+p+' /app/'+p+'\n' for p in files))
report={'source':commit,'parent':parent,'files':meta['files'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'diskBefore':disk,'passed':False}
output.write_text(json.dumps(report,indent=2))
try:
 with (root/'build-config39.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--memory-swap','512m','--cpu-quota','50000','--label','org.opencontainers.image.revision='+commit,'-t','pongit:responsive-config39-57ff565','.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect','pongit:responsive-config39-57ff565']))[0]['Id']
 with (root/'build-config39-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-config39-tests','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5',report['image'],'node','--import','tsx','--test','tests/public-chain-read.test.ts','tests/agent-pool-server.test.ts'],stdout=log,stderr=subprocess.STDOUT,timeout=90,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
