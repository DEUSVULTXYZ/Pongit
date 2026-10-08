"""Pinned web admission preparation and private RPC priority builds."""
import datetime,hashlib,json,os,pathlib,shutil,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
def used():
 s=os.statvfs('/');return 100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail)
def unpack(label):
 source=root/(label+'.tar.gz');proof=json.loads((root/(label+'.sha.json')).read_text())
 assert hashlib.sha256(source.read_bytes()).hexdigest()==proof['sha256']
 context=root/(label+'-build');assert not context.exists();context.mkdir()
 with tarfile.open(source) as archive:archive.extractall(context,filter='data')
 return context,proof['sha256']
def build(kind,context,sha,commit,memory,extra):
 report={'source':commit,'archiveSha256':sha,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False,'diskBefore':used()}
 path=root/('build-admission-'+kind+'-16.json');assert not path.exists();path.write_text(json.dumps(report,indent=2))
 assert report['diskBefore']<80,('Scoped cleanup required',report['diskBefore'])
 # A capped compiler can still consume its default additional swap allowance
 # and stall the entire VPS. Reserve resident headroom first; forbid that swap
 # extension. A build failure is preferable to starving live game services.
 assert memory.endswith('m') and memory[:-1].isdigit()
 available=int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))*1024
 required=(int(memory[:-1])+1024)*1024*1024
 report.update(memoryAvailableBytes=available,memoryRequiredBytes=required,swapAllowanceBytes=0)
 path.write_text(json.dumps(report,indent=2))
 assert available>=required,'Insufficient resident memory reserve; no compiler started'
 tag='pongit:responsive-admission-'+kind+'-'+commit[:7]+'-20261008'
 try:
  with path.with_suffix('.log').open('x') as log:
   subprocess.run(['docker','build','--memory',memory,'--memory-swap',memory,'--cpu-quota','150000','--label','org.opencontainers.image.revision='+commit,'-t',tag,*extra,'.'],cwd=context,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=900)
  report.update(passed=True,image=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['Id'])
 finally:
  report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();path.write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
web,sha=unpack('admission-source-228c5b1')
shutil.copy2('/opt/pongit/releases/sync-public-214c95a/web-source/Dockerfile.web',web/'Dockerfile.web')
for src,name in [('live/metadata/manifest.json','agent-pool.json'),('live/metadata/publication-review.json','agent-pool-release-review.json'),('agents/evidence/agent-reusable-index.json','agent-reusable-index.json'),('human/secrets/manifest.json','independent.json')]:
 target=web/'deployments'/name;shutil.copy2(root/src,target);target.chmod(0o644)
build('web',web,sha,'228c5b1955d75359cc3a6a034d3abb65c18b8f63','1800m',['-f','Dockerfile.web','--target','web','--build-arg','NEXT_PUBLIC_API_URL=https://pongit.xyz/api','--build-arg','NEXT_PUBLIC_WS_URL=wss://pongit.xyz/ws','--build-arg','NEXT_PUBLIC_RP_ID=pongit.xyz','--build-arg','PONG_REQUIRE_AGENT_POOL_MANIFEST=true'])
