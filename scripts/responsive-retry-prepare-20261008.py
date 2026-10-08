"""Prepare a fresh namespace after the immutable rules-17 registration failure.

No chain writes, source cancellation, key replacement or failed-record edits.
All generated operation helpers have their exact transformations recorded.
"""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, tarfile

os.umask(0o077)
old=pathlib.Path('/opt/pongit/releases/responsive-20261008')
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
def load(p):return json.loads(pathlib.Path(p).read_text())
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def save(p,v):
    with p.open('x') as f:json.dump(v,f,indent=2)
    p.chmod(0o600);os.chown(p,1000,1000)
def state(n):return json.loads(subprocess.check_output(['docker','inspect','-f','{{json .State}}',n]))

failed=state('pongit-responsive-import-20261008-1')
assert not failed['Running'] and failed['ExitCode']==1
for name in ['admission','maintenance','archive','engines','sponsor']:
    assert not state('pongit-arcade-five-'+name+'-1')['Running']
assert not state('pongit-relayer-1')['Running']
prior=load(old/'agents/secrets/deployment.json')
assert prior['prefix']=='reusable-agents-20261008-1' and not prior.get('arenas') and not prior.get('common')
assert prior['modules']['ContinuingFiveLaneAgentPool'].lower()=='0xccff763eef609c3923dd42f0359a1887da21407b'
frozen=load(old/'agents/evidence/freeze-3.json');assert frozen['passed'] and frozen['results']=='938'
assert load(old/'restore-drained.json')['passed']
assert not (root/'build-source').exists() and not (root/'agents').exists()
package=load(root/'package.json')
assert len(package['commit'])==40 and package['namespace']=='reusable-agents-20261008-2'
for filename,field in [('source.tar.gz','sourceSha256'),('contracts.tar.gz','artifactsSha256')]:
    assert sha(root/filename)==package[field]
disk=os.statvfs('/');used=100*(disk.f_blocks-disk.f_bfree)/(disk.f_blocks-disk.f_bfree+disk.f_bavail)
assert used<80,('Scoped cleanup required before image build',used)
for filename,name in [('source.tar.gz','build-source'),('contracts.tar.gz','artifacts')]:
    dest=root/name;dest.mkdir()
    with tarfile.open(root/filename,'r:gz') as tar:tar.extractall(dest,filter='data')
for name,digest in package['files'].items():assert sha(root/'artifacts'/name)==digest
source=root/'build-source'
assert sha(source/'package-lock.json')=='2b7fdc137a66d595279202d9bcb6526b38bc3644a1666594cc2135ec6f51d8ce'
pool=load(root/'artifacts/contracts/out/ContinuingFiveLaneAgentPool.sol/ContinuingFiveLaneAgentPool.json')
assert (len(pool['deployedBytecode']['object'])-2)//2<=32768
for name in ['source','human-evidence']:
    shutil.copytree(old/name,root/name)
for name in ['evidence','agents','agents/metadata','agents/evidence','agents/secrets','agents/state','agents/diagnostics']:
    p=root/name;p.mkdir(exist_ok=True,mode=0o700);os.chown(p,1000,1000)
shutil.copytree(old/'agents/metadata',root/'agents/metadata',dirs_exist_ok=True)
shutil.copy2(old/'agents/evidence/freeze-3.json',root/'agents/evidence/freeze-3.json')
for name in ['human-evidence','agents/metadata']:
    os.chown(root/name,1000,1000)
    for p in (root/name).rglob('*'):os.chown(p,1000,1000)
overrides=load(old/'evidence/runtime-source-overrides.json')
for row in overrides:
    assert sha(row['source'])==row['oldSha256']
    row['candidateSha256']=sha(source/row['target'][5:])
save(root/'evidence/runtime-source-overrides.json',overrides)
helpers={
 'responsive-migration-20261008.py':'responsive-migration-20261008.py',
 'responsive-agent-control-20261008.ts':'responsive-agent-control-20261008.ts',
 'responsive-activate-20261008.ts':'responsive-activate-20261008.ts',
 'responsive-human-drain-proof-20261008.ts':'responsive-human-drain-proof-20261008.ts',
 'responsive-stage-20261008.py':'responsive-stage-20261008.py',
 'responsive-build-web-index-20261008.py':'responsive-build-web-index-20261008.py',
 'responsive-runtime-20261008.py':'responsive-runtime-20261008.py',
 'responsive-backup-20261008.py':'responsive-backup-20261008.py',
 'responsive-source-observe-20261008.py':'observe.py',
 'responsive-restore-20261008.py':'responsive-restore-20261008.py',
}
transformed=[]
for name,destination in helpers.items():
    original=source/'scripts'/name
    text=original.read_text().replace(str(old),str(root)).replace('reusable-agents-20261008-1','reusable-agents-20261008-2').replace('pongit-responsive-','pongit-responsive-r2-')
    if name=='responsive-backup-20261008.py':
        # Preserve every failed transaction's deployment record as well as the
        # new candidate. Previous backup dumps already remain off VPS.
        insertion="paths += [pathlib.Path('"+str(old)+"')/n for n in ['agents/secrets','agents/evidence','agents/metadata','human-evidence','evidence']]\n"
        text=text.replace('paths = [p for p in paths if p.exists()]',insertion+'paths = [p for p in paths if p.exists()]')
    if name=='responsive-restore-20261008.py':
        # The new namespace has made no transactions yet. Restoration must
        # preserve the abandoned candidate's journal, not invent preparation.
        text=text.replace("id LIKE 'reusable-agents-20261008-2:%'","id LIKE 'reusable-agents-20261008-1:%'")
        text=text.replace('responsivePreparationJobs','preservedCandidateJobs')
    path=root/destination;path.write_text(text);path.chmod(0o600);os.chown(path,1000,1000)
    transformed.append({'source':name,'sourceSha256':sha(original),'target':str(path),'targetSha256':sha(path)})
save(root/'evidence/helper-transformations.json',{'sourceCommit':package['commit'],'namespace':'reusable-agents-20261008-2','files':transformed})
template=load(old/'agent-prepare-runtime-1.json')
s=template['services']['qualification'];s['environment']['PONG_REUSABLE_AGENT_PREFIX']='reusable-agents-20261008-2'
s['volumes']=[v.replace(str(old),str(root)) for v in s['volumes']]
save(root/'agent-prepare-runtime-1.json',template)
shutil.copy2(old/'archive-rules-upgrade.sql',root/'archive-rules-upgrade.sql')
base=load(old/'build-runtime-current.json');assert base['passed']
dockerfile='''FROM BASE
USER root
RUN rm -rf /app/shared /app/relayer /app/scripts /app/web /app/agent-sdk /app/contracts /app/deployments /app/tests /app/docs
COPY --chown=node:node . /app
LABEL org.opencontainers.image.revision="COMMIT"
USER node
WORKDIR /app
'''.replace('BASE',base['image']).replace('COMMIT',package['commit'])
(source/'Dockerfile.responsive').write_text(dockerfile)
tag='pongit:responsive-r2-'+package['commit'][:7]+'-20261008'
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':package['commit'],'sourceSha256':package['sourceSha256'],
 'artifactSha256':package['artifactsSha256'],'artifactCount':len(package['files']),'sourceDirectory':str(source),
 'overrideAudit':str(root/'evidence/runtime-source-overrides.json'),'tag':tag,'passed':False,'diskBefore':used}
output=root/'build-runtime-1.json';save(output,report);log=root/'build-runtime-1.log'
try:
    with log.open('x') as f:
        result=subprocess.run(['docker','build','--memory','512m','--cpu-quota','100000','-f','Dockerfile.responsive','-t',tag,'.'],cwd=source,stdout=f,stderr=subprocess.STDOUT,timeout=600)
    assert result.returncode==0,'Build failed; preserve report and original attempt'
    report['image']=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]['Id'];report['passed']=True
finally:
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();report['logSha256']=sha(log)
    output.write_text(json.dumps(report,indent=2));print(json.dumps(report))
if report['passed']:save(root/'build-runtime-current.json',report)
