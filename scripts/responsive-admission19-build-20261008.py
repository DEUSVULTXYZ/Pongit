"""Exact-source sponsor and scheduling image; isolated tests before cutover."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='f85d8a7c9e9c99375320cc1f2f9d33cc68265a00'
context=root/'admission19-build-f85d8a7';output=root/'build-admission-19.json'
assert not context.exists() and not output.exists()
source=root/'admission19-source-f85d8a7.tar';expected=json.loads(source.with_suffix('.sha.json').read_text())
assert expected['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==expected['sha256']
s=os.statvfs('/');used=100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail);assert used<80,('Scoped cleanup required',used)
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
base='sha256:9980088c91d70b2b9e36861a80074690a277779a2688e689ea23f67a7a5bc62e'
files=['relayer/src/rpc-gateway.ts','relayer/src/rpc-scheduler.ts','relayer/src/agents/pool-server.ts','relayer/src/agents/pool-sponsor-server.ts','tests/rpc-scheduler.test.ts','tests/public-chain-read.test.ts','scripts/rpc-gateway-priority-check.ts']
assert all((context/p).is_file() for p in files)
(context/'Dockerfile').write_text('FROM '+base+'\n'+''.join('COPY --chown=node:node '+p+' /app/'+p+'\n' for p in files))
tag='pongit:responsive-admission19-f85d8a7-20261008'
report={'source':commit,'parent':base,'sourceSha256':expected['sha256'],'files':{p:hashlib.sha256((context/p).read_bytes()).hexdigest() for p in files},'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False,'diskBefore':used}
output.write_text(json.dumps(report,indent=2))
try:
 with (root/'build-admission-19.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--cpu-quota','150000','--label','org.opencontainers.image.revision='+commit,'-t',tag,'.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['Id']
 with (root/'build-admission-19-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-admission19-tests','--network','none','--memory','256m','--cpus','0.5',report['image'],'node','--import','tsx','--test',*files[4:6]],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 with (root/'build-admission-19-http.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-admission19-http-test','--network','none','--memory','256m','--cpus','0.5','-e','PONG_GATEWAY_QUALIFICATION=isolated-vps',report['image'],'node','--import','tsx','scripts/rpc-gateway-priority-check.ts'],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
