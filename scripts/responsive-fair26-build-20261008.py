"""Pinned compatible images, isolated HTTP and human admission regressions."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2');commit='02531539ab3927a8f7e119dd22882d5da23c4c3c'
source=root/'fair26-source-0253153.tar.gz';metadata=json.loads((root/'fair26-source-0253153.sha.json').read_text())
assert metadata['commit']==commit and hashlib.sha256(source.read_bytes()).hexdigest()==metadata['sha256']
context=root/'fair26-build-0253153';assert not context.exists();context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
files={
 'rpc':['relayer/src/rpc-gateway.ts','relayer/src/rpc-scheduler.ts','relayer/src/rpc-queue-metrics.ts','tests/rpc-scheduler.test.ts','tests/rpc-queue-metrics.test.ts','scripts/rpc-gateway-priority-check.ts'],
 'human':['relayer/src/main.ts','relayer/src/independent-service.ts','relayer/src/independent-reusable-pool.ts','relayer/src/independent-reusable-lifecycle.ts','relayer/src/independent-admission-observation.ts','relayer/src/independent-writer.ts','tests/independent-admission-observation.test.ts','tests/independent-reusable-lifecycle.test.ts','tests/independent-reusable-admission.test.ts','tests/independent-writer-wake.test.ts']}
parents={'rpc':'sha256:db15d5d83a6a5ce73c8a32ec3a3c03badfbe9cbc430e3121279b253651bb6e80','human':'sha256:9b4929eda2faa243b8c4d1fe3f2bd56a9500501c3b029647af10db76ac85d88d'}
files={'rpc':files['rpc']}
parents['rpc']='sha256:343b642674492c08fcb4c7a5348424811112c08d0183de88f128b45aa17bf39a'
for kind,paths in files.items():
 output=root/('build-fair26-'+kind+'.json');assert not output.exists()
 s=os.statvfs('/');used=100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail);assert used<80,('Scoped cleanup required',used)
 for p in paths:assert (context/p).is_file()
 dockerfile='Dockerfile.'+kind;(context/dockerfile).write_text('FROM '+parents[kind]+'\n'+''.join('COPY --chown=node:node '+p+' /app/'+p+'\n' for p in paths))
 tag='pongit:responsive-fair26-'+kind+'-0253153'
 report={'source':commit,'parent':parents[kind],'sourceSha256':metadata['sha256'],'files':{p:hashlib.sha256((context/p).read_bytes()).hexdigest() for p in paths},'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False,'diskBefore':used}
 output.write_text(json.dumps(report,indent=2))
 try:
  with (root/('build-fair26-'+kind+'.log')).open('x') as log:
   subprocess.run(['docker','build','--memory','512m','--cpu-quota','150000','--label','org.opencontainers.image.revision='+commit,'-f',dockerfile,'-t',tag,'.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
  report['image']=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['Id']
  tests=[p for p in paths if p.startswith('tests/')]
  with (root/('build-fair26-'+kind+'-tests.log')).open('x') as log:
   subprocess.run(['docker','run','--name','pongit-fair26-'+kind+'-tests','--network','none','--memory','256m','--cpus','0.5',report['image'],'node','--import','tsx','--test',*tests],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
  if kind=='rpc':
   with (root/'build-fair26-rpc-http.log').open('x') as log:
    subprocess.run(['docker','run','--name','pongit-fair26-rpc-http','--network','none','--memory','256m','--cpus','0.5','-e','PONG_GATEWAY_QUALIFICATION=isolated-vps',report['image'],'node','--import','tsx','scripts/rpc-gateway-priority-check.ts'],stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
  report['passed']=True
 finally:
  report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();output.write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
