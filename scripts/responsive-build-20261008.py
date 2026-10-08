"""Build the tested responsive runtime without inheriting obsolete source files."""
import datetime,hashlib,json,os,pathlib,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
p=json.loads((root/'package.json').read_text())
assert p['commit']=='0b75d5897a14394dbad67eb38a1f2e8c9ebb4e41'
assert digest(root/'source.tar.gz')==p['sourceSha256'] and digest(root/'contracts.tar.gz')==p['artifactsSha256']
disk=os.statvfs('/');used=100*(disk.f_blocks-disk.f_bfree)/(disk.f_blocks-disk.f_bfree+disk.f_bavail)
assert used<80,('Usable disk must be below 80 percent',used)
source=root/'build-source';artifacts=root/'artifacts'
assert not source.exists() and not artifacts.exists()
for archive,destination in [('source.tar.gz',source),('contracts.tar.gz',artifacts)]:
    destination.mkdir()
    with tarfile.open(root/archive,'r:gz') as tar:tar.extractall(destination,filter='data')
for name,sha in p['files'].items():assert digest(artifacts/name)==sha
base='sha256:3f5947f149c4a98c90a2f88790cd6044e32ce096e2961cf78fc71ce89ac36f39'
# This exact dependency lock is already installed in the public Node 24.21.0
# image. Reusing it avoids an unbounded reinstall on the production host.
assert digest(source/'package-lock.json')=='2b7fdc137a66d595279202d9bcb6526b38bc3644a1666594cc2135ec6f51d8ce'
dockerfile='''FROM BASE
USER root
RUN cd /app && echo "2b7fdc137a66d595279202d9bcb6526b38bc3644a1666594cc2135ec6f51d8ce  package-lock.json" | sha256sum -c - && node -e "if(process.versions.node!=='24.21.0')process.exit(1)"
RUN rm -rf /app/shared /app/relayer /app/scripts /app/web /app/agent-sdk /app/contracts /app/deployments /app/tests /app/docs
COPY --chown=node:node . /app
LABEL org.opencontainers.image.revision="COMMIT"
USER node
WORKDIR /app
'''.replace('BASE',base).replace('COMMIT',p['commit'])
(source/'Dockerfile.responsive').write_text(dockerfile)
tag='pongit:responsive-0b75d58-20261008'
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':p['commit'],'tag':tag,'passed':False,
    'sourceSha256':p['sourceSha256'],'artifactSha256':p['artifactsSha256'],'artifactCount':len(p['files']),'diskBefore':used}
path=root/'build-runtime-1.json';log=root/'build-runtime-1.log'
with path.open('x') as f:json.dump(report,f)
try:
    with log.open('x') as f:
        result=subprocess.run(['docker','build','--memory','512m','--cpu-quota','100000','-f','Dockerfile.responsive','-t',tag,'.'],cwd=source,stdout=f,stderr=subprocess.STDOUT,timeout=600)
    assert result.returncode==0,'Runtime image build failed; preserve original log'
    image=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]
    report['image']=image['Id'];report['passed']=True
finally:
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();report['logSha256']=digest(log)
    path.write_text(json.dumps(report,indent=2));print(json.dumps(report))
