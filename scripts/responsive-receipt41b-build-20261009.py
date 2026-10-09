"""Small gateway-only image, exact committed inputs and no network in tests."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='e31ad5d2069d82c5fbdcc621992016b4d7bf13a1'
parent='sha256:bb7b02c43617f9f11e6e3033f6e44b3583d4bf308dc52e96a6d0d1008f455a5f'
source=root/'receipt41-source-e31ad5d.tar.gz';meta=json.loads(source.with_suffix('.json').read_text())
assert meta['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==meta['sha256']
context=root/'receipt41b-build-e31ad5d';output=root/'build-receipt41b.json';assert not context.exists() and not output.exists()
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
 with (root/'build-receipt41b.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--memory-swap','512m','--cpu-quota','50000','--label','org.opencontainers.image.revision='+commit,'-t','pongit:responsive-receipt41b-e31ad5d','.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect','pongit:responsive-receipt41b-e31ad5d']))[0]['Id']
 with (root/'build-receipt41b-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-receipt41b-tests','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5',report['image'],'node','--import','tsx','--test',*files[5:8]],stdout=log,stderr=subprocess.STDOUT,timeout=90,check=True)
 with (root/'build-receipt41b-http.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-receipt41b-http-test','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5','-e','PONG_GATEWAY_QUALIFICATION=isolated-vps',report['image'],'node','--import','tsx','scripts/rpc-gateway-priority-check.ts'],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
