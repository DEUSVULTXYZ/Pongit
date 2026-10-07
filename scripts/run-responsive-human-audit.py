"""Run one read-only public seed audit; never start the copied relayer command."""
import copy
import json
import os
import pathlib
import subprocess
import sys

os.umask(0o077)
root=pathlib.Path('/opt/pongit/releases/command-integrity-20261007')
attempt=int(sys.argv[1]);assert attempt in [1,2,3,4,5]
def inspect(name): return json.loads(subprocess.check_output(['docker','inspect',name]))[0]
human=inspect('pongit-relayer-1'); operator=inspect('pongit-arcade-five-maintenance-1')
environment=dict(v.split('=',1) for v in human['Config']['Env'])
operator_environment=dict(v.split('=',1) for v in operator['Config']['Env'])
environment.update(PONG_RESPONSIVE_HUMAN='audit-public-rules18-20261007',
 PONG_INDEPENDENT_MANIFEST='/audit-source/manifest.json',PONG_INDEPENDENT_SNAPSHOT='/audit-source/source-snapshot.json',
 PONG_HUMAN_MIGRATION_OUTPUT='/evidence/source-audit-'+str(attempt)+'.json',PONG_OPERATOR_DATABASE_URL=operator_environment['DATABASE_URL'])
evidence=root/'human-evidence';evidence.mkdir(mode=0o700,exist_ok=True);os.chown(evidence,1000,1000)
assert not (evidence/('source-audit-'+str(attempt)+'.json')).exists()
if attempt>1:
    prior=inspect('pongit-responsive-human-audit-20261007-'+str(attempt-1))
    assert not prior['State']['Running'] and prior['State']['ExitCode']!=0
    (evidence/('attempt-'+str(attempt-1)+'-failure.json')).write_text(json.dumps({'name':prior['Name'],'state':prior['State']},indent=2))
volumes=[{'type':'bind','source':str(root/'snapshot-responsive-human.ts'),'target':'/app/scripts/snapshot-responsive-human.ts','read_only':True},
 {'type':'bind','source':str(root/'human-seed-audit.ts'),'target':'/app/shared/human-seed-audit.ts','read_only':True},
 {'type':'bind','source':str(root/'PublishedRatings.json'),'target':'/app/contracts/out/PublishedRatings.sol/PublishedRatings.json','read_only':True},
 {'type':'bind','source':'/opt/pongit/releases/reship-repeat-20261007/human/secrets','target':'/audit-source','read_only':True},
 {'type':'bind','source':str(evidence),'target':'/evidence'}]
networks=list(human['NetworkSettings']['Networks'])
assert len(networks)==1
service={'image':human['Image'],'environment':environment,'volumes':volumes,'restart':'no','user':'1000:1000',
 'working_dir':'/app','networks':networks,'mem_limit':'512m','cpus':.5,
 'command':['timeout','--signal=TERM','--kill-after=15','300','node','--import','tsx','scripts/snapshot-responsive-human.ts']}
c={'services':{'audit':service},'networks':{n:{'external':True} for n in networks}}
runtime=root/('human-audit-runtime-'+str(attempt)+'.json')
with runtime.open('x') as f: json.dump(c,f)
name='pongit-responsive-human-audit-20261007-'+str(attempt)
subprocess.run(['docker','compose','-p','pongit-responsive-human-audit','-f',str(runtime),'run','-d','--no-deps','--name',name,'audit'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'started':name,'readOnly':True,'originalTimeoutSeconds':300}))
