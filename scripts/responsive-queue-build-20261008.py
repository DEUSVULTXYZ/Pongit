"""Small reproducible diagnostics/sponsor image; no source overlay in production."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
context=root/'queue-build-6f5d238';output=root/'build-queue-14.json'
assert not context.exists() and not output.exists();context.mkdir()
source=root/'queue-source-6f5d238.tar'
expected=json.loads((root/'queue-source-6f5d238.sha.json').read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest()==expected['sha256']
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
s=os.statvfs('/');used=100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail)
assert used<80,('Scoped cleanup required',used)
base='sha256:70d0db338fbc8e708abab7f0463edef6f5460c23c147e7c6f1f474a8abd1c3c2'
files=['relayer/src/independent-writer.ts','relayer/src/rpc-gateway.ts','relayer/src/rpc-queue-metrics.ts','tests/independent-writer-wake.test.ts','tests/rpc-queue-metrics.test.ts']
assert all((context/p).is_file() for p in files)
(context/'Dockerfile').write_text('FROM '+base+'\n'+''.join('COPY --chown=node:node '+p+' /app/'+p+'\n' for p in files))
tag='pongit:responsive-queue-6f5d238-20261008'
report={'source':'6f5d238ba9d14b582152f23d4cbe9483b727609e','parent':base,'sourceSha256':expected['sha256'],'files':{p:hashlib.sha256((context/p).read_bytes()).hexdigest() for p in files},'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False,'diskBefore':used}
output.write_text(json.dumps(report,indent=2))
try:
 with (root/'build-queue-14.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--cpu-quota','150000','--label','org.opencontainers.image.revision='+report['source'],'-t',tag,'.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['Id']
 # Tests use generated ephemeral keys and a fake RPC/DB, no public chain write.
 with (root/'build-queue-14-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-queue-14-tests','--network','none','--memory','256m','--cpus','0.5',report['image'],'node','--import','tsx','--test',*files[-2:]],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
