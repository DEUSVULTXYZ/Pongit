"""Remove only untagged PONGIT frontend build images, never containers/volumes.
Run on the VPS after a verified production backup. Docker's dependency checks
remain enabled: no force/prune flags and no deletion of tagged rollback images.
"""
import json, subprocess, sys, pathlib, datetime

def docker(*args):
    return subprocess.check_output(['docker', *args], text=True)

ids=docker('images','--filter','dangling=true','-q').split()
containers=docker('ps','-aq').split()
used={x['Image'] for x in json.loads(docker('inspect',*containers))} if containers else set()
images=json.loads(docker('image','inspect',*ids)) if ids else []
selected=[]
for im in images:
    env=set(im['Config'].get('Env') or [])
    if (not im.get('RepoTags') and im['Id'] not in used and
        'NEXT_PUBLIC_RP_ID=pongit.xyz' in env and
        'NEXT_PUBLIC_API_URL=https://pongit.xyz/api' in env):
        selected.append({'id':im['Id'],'created':im['Created'],'bytes':im['Size']})
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'selected':selected,'removed':[]}
if '--apply' in sys.argv:
    for im in selected:
        result=subprocess.run(['docker','image','rm',im['id']],capture_output=True,text=True)
        if result.returncode==0: report['removed'].append(im['id'])
pathlib.Path('artifacts/drand').mkdir(parents=True,exist_ok=True)
pathlib.Path('artifacts/drand/image-cleanup.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'selected':len(selected),'removed':len(report['removed'])}))
