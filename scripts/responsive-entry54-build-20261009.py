import datetime,hashlib,json,os,pathlib,subprocess,tarfile,time
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
source=root/'entry54-source.tar.gz';meta=json.loads(source.with_suffix('.json').read_text())
assert meta['commit']=='a4f12ec00f3064a4304d2474ccca50d0c7f0ea1d' and hashlib.sha256(source.read_bytes()).hexdigest()==meta['sha256']
parent='sha256:69b669777a277f495b950ee467175f630c434a896e574d376c7b43e16114473b'
context=root/'entry54-build';output=root/'build-sponsor-54.json';assert not context.exists() and not output.exists()
v=os.statvfs('/');disk=100*(v.f_blocks-v.f_bfree)/(v.f_blocks-v.f_bfree+v.f_bavail);assert disk<80,('Scoped cleanup required',disk)
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
for p,h in meta['files'].items():assert hashlib.sha256((context/p).read_bytes()).hexdigest()==h
(context/'Dockerfile').write_text('FROM '+parent+'\n'+''.join('COPY --chown=node:node '+f+'/ /app/'+f+'/\n' for f in ['relayer/src','tests','scripts']))
report=dict(source=meta['commit'],parent=parent,files=meta['files'],startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),diskBefore=disk,passed=False)
save=lambda:output.write_text(json.dumps(report,indent=2));save()
try:
 with (root/'build-sponsor54.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--memory-swap','512m','--cpu-quota','50000','--label','org.opencontainers.image.revision='+meta['commit'],'-t','pongit:responsive-sponsor54','.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=180,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect','pongit:responsive-sponsor54']))[0]['Id'];save()
 with (root/'build-sponsor54-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-sponsor54-tests','--network','none','--memory','256m','--cpus','.5',report['image'],'node','--import','tsx','--test','tests/sponsor-intake-window.test.ts','tests/sponsor-bundle.test.ts','tests/independent-writer-wake.test.ts'],stdout=log,stderr=subprocess.STDOUT,timeout=90,check=True)
 for mode in ['baseline','candidate']:
  network='pongit-bundle54-'+mode;pg=network+'-pg';runner=network+'-check'
  subprocess.run(['docker','network','create','--internal',network],check=True,capture_output=True)
  data=root/(network+'-data');data.mkdir(exist_ok=False)
  subprocess.run(['docker','run','-d','--name',pg,'--network',network,'--network-alias','pongit-bundle54-pg','--memory','256m','--memory-swap','256m','--cpus','.5','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=pongitbundle','-v',str(data)+':/var/lib/postgresql/data','postgres:17-alpine'],check=True,capture_output=True)
  try:
   for _ in range(120):
    if subprocess.run(['docker','exec',pg,'pg_isready','-U','postgres','-d','pongitbundle'],capture_output=True).returncode==0:break
    time.sleep(.25)
   else:raise RuntimeError('Isolated PG unavailable')
   with (root/('sponsor54-'+mode+'.log')).open('x') as log:
    run=subprocess.run(['docker','run','--name',runner,'--network',network,'--memory','256m','--cpus','.5','-e','PONG_BUNDLE_QUALIFICATION=isolated-vps','-e','DATABASE_URL=postgres://postgres@pongit-bundle54-pg/pongitbundle','-v',str(context/'scripts/sponsor-intake-pg-check.ts')+':/app/scripts/sponsor-intake-pg-check.ts:ro',parent if mode=='baseline' else report['image'],'node','--import','tsx','scripts/sponsor-intake-pg-check.ts'],stdout=log,stderr=subprocess.STDOUT,timeout=90)
   text=(root/('sponsor54-'+mode+'.log')).read_text()
   if mode=='baseline':
    assert run.returncode!=0 and 'Concurrent validated admissions must share their first transaction' in text
    report['baseline']={'expectedRegressionFailure':True}
   else:
    assert run.returncode==0,'Candidate PG regression failed'
    proof=json.loads(next(x for x in reversed(text.splitlines()) if x.startswith('{')));assert proof['passed'] and proof['intents']==12 and proof['nonces']==3 and proof['productionTransactions']==0
    report['postgres']=proof
   save()
  finally:
   subprocess.run(['docker','stop','--time','10',runner,pg],capture_output=True,timeout=30)
 report['passed']=True
finally:
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(report))
