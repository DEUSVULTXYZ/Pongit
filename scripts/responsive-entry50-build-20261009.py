"""Exact sponsor inputs; isolated unit and real PostgreSQL crash qualification."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile,time
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='cc21874e218880802c2e3695d4d23c13d305abb4'
parent='sha256:dbbf50f57dfa80ebd90a4c9ca23ba168d4aef0255e6411dc1db7d75ff6d285d7'
source=root/'entry50-source-cc21874.tar.gz';meta=json.loads(source.with_suffix('.json').read_text())
assert meta['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==meta['sha256']
context=root/'entry50-build-cc21874';output=root/'build-sponsor-50.json';assert not context.exists() and not output.exists()
v=os.statvfs('/');disk=100*(v.f_blocks-v.f_bfree)/(v.f_blocks-v.f_bfree+v.f_bavail);assert disk<80,('Scoped cleanup required',disk)
context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
files=['relayer/src/agents/pool-sponsor-server.ts','relayer/src/independent-writer.ts','relayer/src/sponsor-bundle.ts','relayer/src/sponsor-prepare.ts',
 'shared/agent-pool-sponsor.ts','shared/scoped-writer.ts','tests/sponsor-bundle.test.ts','tests/independent-writer-wake.test.ts','tests/agent-pool-sponsor.test.ts','scripts/sponsor-bundle-pg-check.ts']
assert set(files)==set(meta['files'])
for p in files:assert hashlib.sha256((context/p).read_bytes()).hexdigest()==meta['files'][p]
(context/'Dockerfile').write_text('FROM '+parent+'\n'+''.join('COPY --chown=node:node '+f+'/ /app/'+f+'/\n' for f in ['relayer/src','shared','tests','scripts']))
report={'source':commit,'parent':parent,'files':meta['files'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'diskBefore':disk,'passed':False}
save=lambda:output.write_text(json.dumps(report,indent=2))
save();dbStarted=False;driverStarted=False
try:
 with (root/'build-sponsor50.log').open('x') as log:
  subprocess.run(['docker','build','--memory','512m','--memory-swap','512m','--cpu-quota','50000','--label','org.opencontainers.image.revision='+commit,'-t','pongit:responsive-sponsor50-cc21874','.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=150,check=True)
 report['image']=json.loads(subprocess.check_output(['docker','image','inspect','pongit:responsive-sponsor50-cc21874']))[0]['Id'];save()
 with (root/'build-sponsor50-tests.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-sponsor50-tests','--network','none','--memory','256m','--memory-swap','256m','--cpus','.5',report['image'],'node','--import','tsx','--test',*files[6:9]],stdout=log,stderr=subprocess.STDOUT,timeout=90,check=True)
 pg=json.loads(subprocess.check_output(['docker','image','inspect','postgres:17-alpine']))[0]['Id'];report['isolatedPostgresImage']=pg
 subprocess.run(['docker','network','create','--internal','pongit-bundle50-test'],check=True,capture_output=True)
 data=root/'bundle50-pg-data';data.mkdir(exist_ok=False)
 subprocess.run(['docker','run','-d','--name','pongit-bundle50-pg','--network','pongit-bundle50-test','--memory','256m','--memory-swap','256m','--cpus','.5',
  '-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=pongitbundle','-v',str(data)+':/var/lib/postgresql/data',pg],check=True,capture_output=True);dbStarted=True
 # Fresh test-only database: no ports, no production network, no user data.
 for _ in range(120):
  if subprocess.run(['docker','exec','pongit-bundle50-pg','pg_isready','-U','postgres','-d','pongitbundle'],capture_output=True).returncode==0:break
  time.sleep(.25)
 else:raise RuntimeError('Isolated database startup failed')
 driverStarted=True
 with (root/'build-sponsor50-postgres.log').open('x') as log:
  subprocess.run(['docker','run','--name','pongit-bundle50-check','--network','pongit-bundle50-test','--memory','256m','--memory-swap','256m','--cpus','.5',
   '-e','PONG_BUNDLE_QUALIFICATION=isolated-vps','-e','DATABASE_URL=postgres://postgres@pongit-bundle50-pg/pongitbundle',report['image'],
   'node','--import','tsx','scripts/sponsor-bundle-pg-check.ts'],stdout=log,stderr=subprocess.STDOUT,timeout=90,check=True)
 lines=(root/'build-sponsor50-postgres.log').read_text().splitlines();proof=json.loads(next(line for line in reversed(lines) if line.startswith('{')))
 assert proof['passed'] and proof['productionTransactions']==0 and proof['nonces']==2 and proof['intents']==8
 report['postgres']=proof;report['passed']=True
finally:
 for name,started in [('pongit-bundle50-check',driverStarted),('pongit-bundle50-pg',dbStarted)]:
  if started:subprocess.run(['docker','stop','--time','10',name],capture_output=True,timeout=25)
 report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(report))
