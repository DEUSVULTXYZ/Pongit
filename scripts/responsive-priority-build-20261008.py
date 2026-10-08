"""Build the isolated scheduling patch; never change provider budgets."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2');context=root/'priority-d62f362-build';path=root/'build-admission-rpc-16.json'
assert not context.exists() and not path.exists();context.mkdir()
source=root/'priority-source-d62f362.tar';sha=json.loads((root/'priority-source-d62f362.sha.json').read_text())['sha256'];assert hashlib.sha256(source.read_bytes()).hexdigest()==sha
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
s=os.statvfs('/');used=100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail);assert used<80,('Scoped cleanup required',used)
base='sha256:51111873f07c5230375c1fe7adf06ca398953eaed9d06bd881de0ee8758f30c4'
(context/'Dockerfile').write_text('FROM '+base+'\nCOPY --chown=node:node relayer/src/rpc-scheduler.ts /app/relayer/src/rpc-scheduler.ts\nCOPY --chown=node:node tests/rpc-scheduler.test.ts /app/tests/rpc-scheduler.test.ts\n')
report={'source':'d62f362246a69ebaf88073cc6faa5181960d81ea','parent':base,'archiveSha256':sha,'passed':False,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'diskBefore':used};path.write_text(json.dumps(report,indent=2))
try:
 with path.with_suffix('.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--cpu-quota','150000','--label','org.opencontainers.image.revision='+report['source'],'-t','pongit:responsive-priority-d62f362-20261008','.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=180)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect','pongit:responsive-priority-d62f362-20261008']))[0]['Id']
 with (root/'build-admission-rpc-16-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-priority-16-tests','--network','none','--memory','256m','--cpus','0.5',report['image'],'node','--import','tsx','--test','tests/rpc-scheduler.test.ts','tests/public-chain-read.test.ts'],stdout=log,stderr=subprocess.STDOUT,check=True,timeout=120)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();path.write_text(json.dumps(report,indent=2));print(json.dumps(report))
