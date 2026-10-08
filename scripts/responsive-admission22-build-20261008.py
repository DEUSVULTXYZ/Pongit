"""Exact-source sponsor and scheduling image; isolated tests before cutover."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='fd1838e5a80b4045c3729f476af2581b0991fe36'
context=root/'admission22-build-fd1838e';output=root/'build-admission-22.json'
assert not context.exists() and not output.exists()
source=root/'admission22-source-fd1838e.tar';expected=json.loads(source.with_suffix('.sha.json').read_text())
assert expected['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==expected['sha256']
s=os.statvfs('/');used=100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail);assert used<80,('Scoped cleanup required',used)
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
base='sha256:0085e14426dc245e32119646e64deb455f99c714862ed9c55c301fdce57c023d'
files=['scripts/agent-reusable-engines.ts','tests/agent-runtime-observations.test.ts','tests/agent-pool-engine.test.ts']
assert all((context/p).is_file() for p in files)
(context/'Dockerfile').write_text('FROM '+base+'\n'+''.join('COPY --chown=node:node '+p+' /app/'+p+'\n' for p in files))
tag='pongit:responsive-admission22-fd1838e-20261008'
report={'source':commit,'parent':base,'sourceSha256':expected['sha256'],'files':{p:hashlib.sha256((context/p).read_bytes()).hexdigest() for p in files},'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False,'diskBefore':used}
output.write_text(json.dumps(report,indent=2))
try:
 with (root/'build-admission-22.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--cpu-quota','150000','--label','org.opencontainers.image.revision='+commit,'-t',tag,'.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['Id']
 with (root/'build-admission-22-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-admission22-tests','--network','none','--memory','256m','--cpus','0.5',report['image'],'node','--import','tsx','--test',*files[1:]],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
