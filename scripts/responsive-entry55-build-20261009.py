import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='1f06d83e430b466017f59eac04cc8eb80c1084ba'
parent='sha256:cacaab42f26f7d2e2b5417364c13a7e686e767c0a6ea1172a8808e1fae984934'
source=root/'entry55-source-1f06d83.tar.gz';meta=json.loads(source.with_suffix('.json').read_text())
assert meta['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==meta['sha256']
context=root/'entry55-build-1f06d83';output=root/'build-engines-55.json';assert not context.exists() and not output.exists()
v=os.statvfs('/');disk=100*(v.f_blocks-v.f_bfree)/(v.f_blocks-v.f_bfree+v.f_bavail);assert disk<80,('Scoped cleanup required',disk)
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
files=['scripts/agent-reusable-engines.ts', 'shared/agent-admission-reads.ts', 'shared/agent-runtime-observations.ts', 'tests/agent-admission-reads.test.ts', 'tests/agent-runtime-observations.test.ts', 'tests/reusable-agent-admission.test.ts', 'tests/agent-pool-engine.test.ts']
assert set(files)==set(meta['files'])
for p in files:assert hashlib.sha256((context/p).read_bytes()).hexdigest()==meta['files'][p]
(context/'Dockerfile').write_text('FROM '+parent+'\n'+''.join('COPY --chown=node:node '+f+'/ /app/'+f+'/\n' for f in ['shared','tests','scripts']))
report=dict(source=commit,parent=parent,files=meta['files'],startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),diskBefore=disk,passed=False)
save=lambda:output.write_text(json.dumps(report,indent=2));save()
try:
 with (root/'build-engines55.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--memory-swap','512m','--cpu-quota','50000','--label','org.opencontainers.image.revision='+commit,'-t','pongit:responsive-engines55-1f06d83','.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=180,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect','pongit:responsive-engines55-1f06d83']))[0]['Id'];save()
 with (root/'build-engines55-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-engines55-tests','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5',report['image'],'node','--import','tsx','--test',*[p for p in files if p.startswith('tests/')]],stdout=log,stderr=subprocess.STDOUT,timeout=90,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(report))
