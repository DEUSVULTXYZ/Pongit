"""Restore the explicit human role before public admission; no chain mutation."""
import datetime, hashlib, json, os, pathlib, subprocess
os.umask(0o077)
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
live=root/'live';canonical=pathlib.Path('/opt/pongit/releases/human-v3-20261005/human-runtime.json')
load=lambda p:json.loads(p.read_text())
report=live/'evidence/human-command-correction.json';assert not report.exists()
current=load(canonical);assert current==load(live/'human-runtime.json')
s=current['services']['relayer'];assert s['environment']['PONG_INDEPENDENT_ADMISSION']=='false'
assert s['image']==load(root/'build-runtime-current.json')['image']
assert s.get('command') is None
old=load(live/'previous-human-runtime.private.json')['services']['relayer']
old_image=json.loads(subprocess.check_output(['docker','image','inspect',old['image']]))[0]
command=['node','--import','tsx','relayer/src/main.ts']
assert old_image['Config']['Cmd']==command and old.get('command') is None
container=json.loads(subprocess.check_output(['docker','inspect','pongit-relayer-1']))[0]
assert container['Config']['Cmd']==['node','scripts/agent-reusable-process.mjs','reader']
before=canonical.read_bytes();backup=live/'previous-human-command.private.json'
with backup.open('xb') as f:f.write(before)
s['command']=command
for p in [canonical,live/'human-runtime.json']:
    p.write_text(json.dumps(current,indent=2)+'\n');p.chmod(0o600)
e={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':False,'command':command,
   'backupSha256':hashlib.sha256(before).hexdigest(),'image':s['image'],'chainWrites':0}
report.write_text(json.dumps(e,indent=2))
try:
    subprocess.run(['docker','compose','-p','pongit','-f',str(canonical),'up','-d','--no-deps','relayer'],check=True)
    actual=json.loads(subprocess.check_output(['docker','inspect','pongit-relayer-1']))[0]
    assert actual['Config']['Cmd']==command
    e['passed']=True
finally:
    e['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();report.write_text(json.dumps(e,indent=2))
print(json.dumps(e))
