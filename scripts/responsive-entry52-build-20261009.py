import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='5f8cab3bdc9b941da60cb9ba2fe40477464b57c4'
parent='sha256:fa860d15ea69a5da3f8ee3e4392b863718644e5a9a8aa36d54f1b17c93b4dde8'
source=root/'entry52-source-5f8cab3.tar.gz';meta=json.loads(source.with_suffix('.json').read_text())
assert meta['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==meta['sha256']
context=root/'entry52-build-5f8cab3';output=root/'build-engines-52.json';assert not context.exists() and not output.exists()
v=os.statvfs('/');disk=100*(v.f_blocks-v.f_bfree)/(v.f_blocks-v.f_bfree+v.f_bavail);assert disk<80,('Scoped cleanup required',disk)
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
files=['scripts/agent-reusable-engines.ts', 'shared/agent-admission-reads.ts', 'tests/agent-admission-reads.test.ts', 'tests/agent-runtime-observations.test.ts', 'tests/reusable-agent-admission.test.ts']
assert set(files)==set(meta['files'])
for p in files:assert hashlib.sha256((context/p).read_bytes()).hexdigest()==meta['files'][p]
(context/'Dockerfile').write_text('FROM '+parent+'\n'+''.join('COPY --chown=node:node '+f+'/ /app/'+f+'/\n' for f in ['shared','tests','scripts']))
report=dict(source=commit,parent=parent,files=meta['files'],startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),diskBefore=disk,passed=False)
save=lambda:output.write_text(json.dumps(report,indent=2));save()
try:
 with (root/'build-engines52.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--memory-swap','512m','--cpu-quota','50000','--label','org.opencontainers.image.revision='+commit,'-t','pongit:responsive-engines52-5f8cab3','.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=180,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect','pongit:responsive-engines52-5f8cab3']))[0]['Id'];save()
 with (root/'build-engines52-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-engines52-tests','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5',report['image'],'node','--import','tsx','--test',*files[2:]],stdout=log,stderr=subprocess.STDOUT,timeout=90,check=True)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(report))
