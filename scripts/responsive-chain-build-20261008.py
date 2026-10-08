"""Build the read-only gateway correction from a pinned source archive."""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='132a51b';source=root/'chain-source-132a51b.tar.gz';context=root/'chain-build-132a51b'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='ebec7310fc14d5416291590c5915ca821ef426e9869ffd23bb325cc974dd6959'
assert not context.exists();context.mkdir()
with tarfile.open(source) as archive:archive.extractall(context,filter='data')
def disk():
 s=os.statvfs('/');return 100*(s.f_blocks-s.f_bfree)/(s.f_blocks-s.f_bfree+s.f_bavail)
def build(kind,dockerfile,extra,memory):
 path=root/('build-chain-'+kind+'-12.json');assert not path.exists()
 used=disk();assert used<80,('Scoped cleanup required',used)
 tag='pongit:responsive-chain-'+kind+'-'+commit+'-20261008'
 report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':commit,'tag':tag,'passed':False,'diskBefore':used}
 path.write_text(json.dumps(report,indent=2));log=path.with_suffix('.log')
 try:
  with log.open('x') as output:
   result=subprocess.run(['docker','build','--memory',memory,'--cpu-quota','150000','-f',dockerfile,'-t',tag,
    '--label','org.opencontainers.image.revision='+commit,*extra,'.'],cwd=context,stdout=output,stderr=subprocess.STDOUT,timeout=900)
  assert result.returncode==0,'Image build failed; preserve log'
  report.update(image=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['Id'],passed=True)
 finally:
  report.update(finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),logSha256=hashlib.sha256(log.read_bytes()).hexdigest())
  path.write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
base='sha256:9414d534bc5930795a8b64e707d3e30e25d7fd330a33f285ac9e2dfeb2ae21fa'
assert hashlib.sha256((context/'package-lock.json').read_bytes()).hexdigest()=='2b7fdc137a66d595279202d9bcb6526b38bc3644a1666594cc2135ec6f51d8ce'
(context/'Dockerfile.chain').write_text('FROM '+base+'\nUSER root\nRUN rm -rf /app/shared /app/relayer /app/scripts /app/web /app/agent-sdk /app/contracts /app/deployments /app/tests /app/docs\nCOPY --chown=node:node . /app\nUSER node\nWORKDIR /app\n')
build('runtime','Dockerfile.chain',[],'512m')
shutil.copy2('/opt/pongit/releases/sync-public-214c95a/web-source/Dockerfile.web',context/'Dockerfile.web')
for src,name in [('live/metadata/manifest.json','agent-pool.json'),('live/metadata/publication-review.json','agent-pool-release-review.json'),
 ('agents/evidence/agent-reusable-index.json','agent-reusable-index.json'),('human/secrets/manifest.json','independent.json')]:
 target=context/'deployments'/name;shutil.copy2(root/src,target);target.chmod(0o644)
build('web','Dockerfile.web',['--target','web','--build-arg','NEXT_PUBLIC_API_URL=https://pongit.xyz/api',
 '--build-arg','NEXT_PUBLIC_WS_URL=wss://pongit.xyz/ws','--build-arg','NEXT_PUBLIC_RP_ID=pongit.xyz','--build-arg','PONG_REQUIRE_AGENT_POOL_MANIFEST=true'],'1800m')
