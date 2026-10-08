"""Build the reviewed human cadence fix; preserve the first image and evidence."""
import datetime, hashlib, json, os, pathlib, subprocess, tarfile

root=pathlib.Path('/opt/pongit/releases/responsive-20261008')
def load(p):return json.loads(pathlib.Path(p).read_text())
def digest(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
package=load(root/'refresh-package.json')
assert package['commit'].startswith('123fc74')
original=load(root/'build-runtime-1.json');assert original['passed']
archive=root/'source-123fc74.tar.gz';assert digest(archive)==package['sourceSha256']
source=root/'build-source-123fc74';assert not source.exists()
disk=os.statvfs('/');used=100*(disk.f_blocks-disk.f_bfree)/(disk.f_blocks-disk.f_bfree+disk.f_bavail)
assert used<80,('Scoped cleanup required before build',used)
source.mkdir()
with tarfile.open(archive,'r:gz') as tar:tar.extractall(source,filter='data')
assert digest(source/'package-lock.json')==digest(root/'build-source/package-lock.json')
audit=load(root/'evidence/runtime-source-overrides.json')
for row in audit:
    assert digest(row['source'])==row['oldSha256']
    row['candidateSha256']=digest(source/row['target'][5:])
audit_path=root/'evidence/runtime-source-overrides-123fc74.json'
with audit_path.open('x') as f:json.dump(audit,f,indent=2)
dockerfile='''FROM BASE
USER root
RUN rm -rf /app/shared /app/relayer /app/scripts /app/web /app/agent-sdk /app/contracts /app/deployments /app/tests /app/docs
COPY --chown=node:node . /app
LABEL org.opencontainers.image.revision="COMMIT"
USER node
WORKDIR /app
'''.replace('BASE',original['image']).replace('COMMIT',package['commit'])
(source/'Dockerfile.responsive').write_text(dockerfile)
tag='pongit:responsive-123fc74-20261008'
report={**{k:original[k] for k in ['artifactSha256','artifactCount']},'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'sourceCommit':package['commit'],'sourceSha256':package['sourceSha256'],'sourceDirectory':str(source),'overrideAudit':str(audit_path),'tag':tag,'passed':False,'diskBefore':used}
path=root/'build-runtime-2.json';log=root/'build-runtime-2.log'
with path.open('x') as f:json.dump(report,f)
try:
    with log.open('x') as f:
        result=subprocess.run(['docker','build','--memory','512m','--cpu-quota','100000','-f','Dockerfile.responsive','-t',tag,'.'],cwd=source,stdout=f,stderr=subprocess.STDOUT,timeout=600)
    assert result.returncode==0,'Build failed; preserve original report'
    report['image']=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['Id'];report['passed']=True
finally:
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();report['logSha256']=digest(log)
    path.write_text(json.dumps(report,indent=2))
if report['passed']:
    with (root/'build-runtime-current.json').open('x') as f:json.dump(report,f,indent=2)
print(json.dumps(report))
