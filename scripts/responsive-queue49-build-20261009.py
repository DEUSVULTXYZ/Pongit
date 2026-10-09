"""Small gateway-only image, exact committed inputs and no network in tests."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='edc24df3fd1bcdbfba39a62b09c04caac4bda3e1'
parent='sha256:e0a0c9be4b9b2f32ec5987ae6aca8925978a738abd731d9b00f96b62ec5e2b5a'
source=root/'queue49-source-edc24df.tar.gz';meta=json.loads(source.with_suffix('.json').read_text())
assert meta['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==meta['sha256']
context=root/'queue49-build-edc24df';output=root/'build-queue49.json';assert not context.exists() and not output.exists()
v=os.statvfs('/');disk=100*(v.f_blocks-v.f_bfree)/(v.f_blocks-v.f_bfree+v.f_bavail);assert disk<80,('Scoped cleanup required',disk)
assert int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))>1048576
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
files=['relayer/src/rpc-gateway.ts', 'relayer/src/rpc-scheduler.ts', 'relayer/src/rpc-read-priority.ts', 'relayer/src/rpc-queue-metrics.ts', 'shared/hub-lease.ts', 'tests/rpc-scheduler.test.ts', 'tests/rpc-read-priority.test.ts', 'tests/rpc-queue-metrics.test.ts', 'scripts/rpc-gateway-priority-check.ts']
assert set(files)==set(meta['files'])
for p in files:assert hashlib.sha256((context/p).read_bytes()).hexdigest()==meta['files'][p]
(context/'Dockerfile').write_text('FROM '+parent+'\n'+''.join('COPY --chown=node:node '+folder+'/ /app/'+folder+'/\n' for folder in ['relayer/src','shared','tests','scripts']))
report={'source':commit,'parent':parent,'files':meta['files'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'diskBefore':disk,'passed':False}
output.write_text(json.dumps(report,indent=2))
try:
 with (root/'build-queue49.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--memory-swap','512m','--cpu-quota','50000','--label','org.opencontainers.image.revision='+commit,'-t','pongit:responsive-queue49-edc24df','.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect','pongit:responsive-queue49-edc24df']))[0]['Id']
 with (root/'build-queue49-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-queue49-tests','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5',report['image'],'node','--import','tsx','--test',*files[5:8]],stdout=log,stderr=subprocess.STDOUT,timeout=90,check=True)
 with (root/'build-queue49-http.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-queue49-http-test','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5','-e','PONG_GATEWAY_QUALIFICATION=isolated-vps',report['image'],'node','--import','tsx','scripts/rpc-gateway-priority-check.ts'],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
