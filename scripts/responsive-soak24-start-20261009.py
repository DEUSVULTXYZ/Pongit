"""Start only the bounded read-only part of qualification; never start game writers.

Browser traffic is a separate, visible local runner. This monitor by itself is
not full qualification and does not alter any public admission/capacity gate.
"""
import copy,datetime,hashlib,json,os,pathlib,subprocess

release=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
previous=pathlib.Path('/opt/pongit/tests/responsive-soak-54-20261009')
root=pathlib.Path('/opt/pongit/tests/responsive-soak24-20261009')
assert not root.exists(),'Preserve original 24-hour window'
preflight=json.loads(subprocess.check_output(['docker','inspect','pongit-responsive-soak-preflight54-1']))[0]
assert not preflight['State']['Running'] and preflight['State']['ExitCode']==0
proof=json.loads(next((previous/'diagnostics/series-soak').glob('series-*.json')).read_text())
assert proof['complete'] and proof['sourcesUnchanged'] and not proof['errors']
assert proof['verdict']['reasons']==['full-24-hours-not-observed','five-simultaneous-games-not-observed']
identities=json.loads((previous/'source-identities.json').read_text())
for entry in identities.values():
    row=json.loads(subprocess.check_output(['docker','inspect',entry['container']]))[0]
    assert row['State']['Running'] and row['Image']==entry['image'] and row['State']['StartedAt']==entry['startedAt']
    assert not any(m['Destination'].startswith('/app/') for m in row['Mounts'])
web=json.loads(subprocess.check_output(['docker','inspect','pongit-arcade-five-arcade-web-1']))[0]
assert web['State']['Running'] and web['Image']=='sha256:b246a10a913c0c9b21f0b02c0395c3f7dd388c60cca113379d6ab7f71f9bfbcb'
reserve=json.loads((release/'evidence/soak-role-reserve-1.json').read_text())
assert reserve['passed'] and len(reserve['transfers'])==3,'Verified reserve allocation required'
acceptance=json.loads((release/'evidence/soak24-start-gates.json').read_text())
assert acceptance['normalBrowserGames']==7 and acceptance['normalBrowserPassed']
assert acceptance['sevenWayPassed'] and acceptance['publicWeb']==web['Image']
assert acceptance['pendingGames']==0,'Do not overlap bounded game drivers'
root.mkdir();root.chmod(0o755)
diagnostics=root/'diagnostics';diagnostics.mkdir();os.chown(diagnostics,1000,1000)
config=json.loads((previous/'preflight.compose.private.json').read_text())
s=config['services']['monitor']
s['container_name']='pongit-responsive-soak24-20261009-1'
s['restart']='no'
s['environment']['PONG_SERIES_SOAK_HOURS']='24'
s['command']=['timeout','--signal=TERM','--kill-after=30','86640','node','--import','tsx','scripts/agent-series-soak.ts']
for volume in s['volumes']:
    if volume['target']=='/diagnostics':volume['source']=str(diagnostics)
path=root/'monitor.compose.private.json';path.write_text(json.dumps(config,indent=2));path.chmod(0o600)
start={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Read-only 24h canonical availability/source/storage; browser traffic and runtime/cost evidence are separate','durationSeconds':86400,'absoluteProcessBoundSeconds':86640,'dispatched':False,'webImage':web['Image'],'backendSources':identities,'startGates':acceptance}
(root/'dispatch.json').write_text(json.dumps(start,indent=2))
subprocess.run(['docker','compose','-p','pongit-responsive-soak24-20261009','-f',str(path),'up','-d','monitor'],check=True,timeout=90,capture_output=True)
start['dispatched']=True;(root/'dispatch.json').write_text(json.dumps(start,indent=2))
print(json.dumps({k:start[k] for k in ['startedAt','durationSeconds','absoluteProcessBoundSeconds','dispatched','scope']}))
