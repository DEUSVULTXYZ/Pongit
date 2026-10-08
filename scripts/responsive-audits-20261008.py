"""Read-only, bounded migration evidence; never dispatch a copied service writer."""
import copy,json,os,pathlib,shutil,subprocess,sys
os.umask(0o077)
root=pathlib.Path('/opt/pongit/releases/responsive-20261008')
old=pathlib.Path('/opt/pongit/releases/command-integrity-20261007')
action=sys.argv[1];attempt=int(sys.argv[2]);assert action in ['snapshot','social'] and 1<=attempt<=4
source_attempt=int(sys.argv[3]) if len(sys.argv)>3 else attempt
previous_attempt=int(sys.argv[4]) if len(sys.argv)>4 else 0
assert 1<=source_attempt<=attempt and 0<=previous_attempt<source_attempt
evidence=root/'human-evidence';evidence.mkdir(mode=0o700,exist_ok=True);os.chown(evidence,1000,1000)
c=json.loads((old/'human-audit-runtime-5.json').read_text());s=c['services']['audit']
s['volumes']=[v for v in s['volumes'] if v['target']!='/evidence']
s['volumes'].append({'type':'bind','source':str(evidence),'target':'/evidence'})
if action=='snapshot':
    output='source-audit-'+str(attempt)+'.json'
    s['environment']['PONG_HUMAN_MIGRATION_OUTPUT']='/evidence/'+output
    seconds=600;script='snapshot-responsive-human.ts'
else:
    prior=json.loads(subprocess.check_output(['docker','inspect','pongit-responsive-social-audit-20261007-8']))[0]
    assert not prior['State']['Running']
    if attempt>1:
        prior_run=json.loads(subprocess.check_output(['docker','inspect','pongit-responsive-social-20261008-'+str(attempt-1)]))[0]
        assert not prior_run['State']['Running'],'Never overlap social audit workers'
    snapshot=evidence/('source-audit-'+str(source_attempt)+'.json');assert snapshot.is_file()
    output='social-audit-'+str(attempt)+'.json';seconds=900;script='audit-responsive-human-social.ts'
    previous=evidence/'previous-source-audit.json'
    if not previous.exists():shutil.copy2(old/'human-evidence/source-audit-5.json',previous);os.chown(previous,1000,1000)
    if previous_attempt:previous=evidence/('source-audit-'+str(previous_attempt)+'.json')
    cache=evidence/'social-canonical-pages.json'
    if not cache.exists():shutil.copy2(old/'human-evidence/social-canonical-pages.json',cache);os.chown(cache,1000,1000)
    s['environment'].update(PONG_RESPONSIVE_SOCIAL='audit-public-rules18-20261007',PONG_HUMAN_SOCIAL_SNAPSHOT='/evidence/'+snapshot.name,
        PONG_HUMAN_SOCIAL_PREVIOUS_SNAPSHOT='/evidence/'+previous.name,PONG_HUMAN_SOCIAL_CACHE='/evidence/'+cache.name,PONG_HUMAN_SOCIAL_OUTPUT='/evidence/'+output)
    for source,target in [(root/script,'/app/scripts/'+script),(root/'human-social-pages.ts','/app/shared/human-social-pages.ts')]:
        s['volumes'].append({'type':'bind','source':str(source),'target':target,'read_only':True})
assert not (evidence/output).exists()
s['command']=['timeout','--signal=TERM','--kill-after=15',str(seconds),'node','--import','tsx','scripts/'+script]
name='pongit-responsive-'+action+'-20261008-'+str(attempt)
path=root/(action+'-runtime-'+str(attempt)+'.json')
with path.open('x') as f:json.dump(c,f)
subprocess.run(['docker','compose','-p','pongit-responsive-audit','-f',str(path),'run','-d','--no-deps','--name',name,'audit'],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({'started':name,'readOnly':True,'originalTimeoutSeconds':seconds}))
