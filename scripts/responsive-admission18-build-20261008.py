"""Exact-source sponsor and scheduling image; isolated tests before cutover."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='28d32cbef0101ec870d20c9ac2c73bd01a0c3604'
context=root/'admission18-build-28d32cb';output=root/'build-admission-18.json'
assert not context.exists() and not output.exists()
source=root/'admission18-source-28d32cb.tar';expected=json.loads(source.with_suffix('.sha.json').read_text())
assert expected['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==expected['sha256']
s=os.statvfs('/');used=100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail);assert used<80,('Scoped cleanup required',used)
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
base='sha256:067d468b1ea2640657b6c03b972f776aae3d28342240e1788e163ac85c67abab'
files=['relayer/src/independent-writer.ts','relayer/src/agents/pool-sponsor.ts','relayer/src/rpc-scheduler.ts',
       'tests/sponsor-intake.test.ts','tests/agent-pool-sponsor.test.ts','tests/rpc-scheduler.test.ts','tests/independent-writer-wake.test.ts']
assert all((context/p).is_file() for p in files)
(context/'Dockerfile').write_text('FROM '+base+'\n'+''.join('COPY --chown=node:node '+p+' /app/'+p+'\n' for p in files))
tag='pongit:responsive-admission18-28d32cb-20261008'
report={'source':commit,'parent':base,'sourceSha256':expected['sha256'],'files':{p:hashlib.sha256((context/p).read_bytes()).hexdigest() for p in files},'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False,'diskBefore':used}
output.write_text(json.dumps(report,indent=2))
try:
 with (root/'build-admission-18.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--cpu-quota','150000','--label','org.opencontainers.image.revision='+commit,'-t',tag,'.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['Id']
 with (root/'build-admission-18-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-admission18-tests','--network','none','--memory','256m','--cpus','0.5',report['image'],'node','--import','tsx','--test',*files[3:]],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
