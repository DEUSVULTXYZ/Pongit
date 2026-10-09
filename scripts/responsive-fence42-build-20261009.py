"""Small gateway-only image, exact committed inputs and no network in tests."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='66543910b457347aca142827b1bfef49249bc3ac'
parent='sha256:fc4edfc5bf24426ad8766aa41f2b8a9c3050123617789d605fb58f55b51346f8'
source=root/'fence42-source-6654391.tar.gz';meta=json.loads(source.with_suffix('.json').read_text())
assert meta['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==meta['sha256']
context=root/'fence42-build-6654391';output=root/'build-fence42.json';assert not context.exists() and not output.exists()
v=os.statvfs('/');disk=100*(v.f_blocks-v.f_bfree)/(v.f_blocks-v.f_bfree+v.f_bavail);assert disk<80,('Scoped cleanup required',disk)
assert int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))>1048576
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
files=['relayer/src/rpc-gateway.ts', 'relayer/src/rpc-scheduler.ts', 'relayer/src/rpc-read-priority.ts', 'relayer/src/rpc-queue-metrics.ts', 'shared/hub-lease.ts', 'tests/rpc-scheduler.test.ts', 'tests/rpc-read-priority.test.ts', 'tests/rpc-queue-metrics.test.ts', 'scripts/rpc-gateway-priority-check.ts']
assert set(files)==set(meta['files'])
for p in files:assert hashlib.sha256((context/p).read_bytes()).hexdigest()==meta['files'][p]
(context/'Dockerfile').write_text('FROM '+parent+'\n'+''.join('COPY --chown=node:node '+p+' /app/'+p+'\n' for p in files))
report={'source':commit,'parent':parent,'files':meta['files'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'diskBefore':disk,'passed':False}
output.write_text(json.dumps(report,indent=2))
try:
 with (root/'build-fence42.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--memory-swap','512m','--cpu-quota','50000','--label','org.opencontainers.image.revision='+commit,'-t','pongit:responsive-fence42-6654391','.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect','pongit:responsive-fence42-6654391']))[0]['Id']
 with (root/'build-fence42-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-fence42-tests','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5',report['image'],'node','--import','tsx','--test',*files[5:8]],stdout=log,stderr=subprocess.STDOUT,timeout=90,check=True)
 with (root/'build-fence42-http.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-fence42-http-test','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5','-e','PONG_GATEWAY_QUALIFICATION=isolated-vps',report['image'],'node','--import','tsx','scripts/rpc-gateway-priority-check.ts'],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
