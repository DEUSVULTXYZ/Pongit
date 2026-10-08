"""Exact-source sponsor and scheduling image; isolated tests before cutover."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='ce7968fead3fa1f62816d24b2b1a1e10a40c554d'
context=root/'gateway24-build-ce7968f';output=root/'build-gateway-24.json'
assert not context.exists() and not output.exists()
source=root/'fix24-source-ce7968f.tar.gz';expected=json.loads((root/'fix24-source-ce7968f.sha.json').read_text())
assert expected['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==expected['sha256']
s=os.statvfs('/');used=100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail);assert used<80,('Scoped cleanup required',used)
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
base='sha256:dbbf50f57dfa80ebd90a4c9ca23ba168d4aef0255e6411dc1db7d75ff6d285d7'
files=['relayer/src/rpc-gateway.ts','relayer/src/rpc-scheduler.ts','relayer/src/rpc-queue-metrics.ts','tests/rpc-scheduler.test.ts','tests/rpc-queue-metrics.test.ts','scripts/rpc-gateway-priority-check.ts']
assert all((context/p).is_file() for p in files)
(context/'Dockerfile').write_text('FROM '+base+'\n'+''.join('COPY --chown=node:node '+p+' /app/'+p+'\n' for p in files))
tag='pongit:responsive-gateway24-ce7968f-20261008'
report={'source':commit,'parent':base,'sourceSha256':expected['sha256'],'files':{p:hashlib.sha256((context/p).read_bytes()).hexdigest() for p in files},'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False,'diskBefore':used}
output.write_text(json.dumps(report,indent=2))
try:
 with (root/'build-gateway-24.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--cpu-quota','150000','--label','org.opencontainers.image.revision='+commit,'-t',tag,'.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['Id']
 with (root/'build-gateway-24-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-gateway24-tests','--network','none','--memory','256m','--cpus','0.5',report['image'],'node','--import','tsx','--test',*files[3:5]],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 with (root/'build-gateway-24-http.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-gateway24-http-test','--network','none','--memory','256m','--cpus','0.5','-e','PONG_GATEWAY_QUALIFICATION=isolated-vps',report['image'],'node','--import','tsx','scripts/rpc-gateway-priority-check.ts'],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
