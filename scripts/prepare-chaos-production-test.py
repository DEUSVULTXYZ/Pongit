"""Extract only existing coordinator settings to a private test file; never print values."""
import json,pathlib,subprocess
root=pathlib.Path('/opt/pongit/tests/drand-20260913/verification')
env=dict(s.split('=',1) for s in json.loads(subprocess.check_output(['docker','inspect','pongit-relayer-1'],text=True))[0]['Config']['Env'] if '=' in s)
key=env['INTERLUDE_COORDINATOR_KEY'];assert key.startswith('0x') and len(key)==66
target=pathlib.Path('/opt/pongit/secrets/rooms/chaos-production-test.env')
target.write_text('INTERLUDE_COORDINATOR_KEY='+key+'\nROOMS_PRESSURE_KEY_FILE=/secrets/pressure.json\n');target.chmod(0o600)
current=pathlib.Path('/opt/pongit/current/deployments');game=json.loads((current/'interlude-rooms.json').read_text());assert game['app']=='0x695307022ac7add03117e8f3b59369d7ee7a4724'
finance=next(m for m in json.loads((current/'rooms-finance.json').read_text()) if m['app']==game['app'])
out=root/'artifacts/realtime';out.mkdir(exist_ok=True)
(out/'manifests.json').write_text(json.dumps({'game':game,'finance':finance}))
print('Private coordinator test configuration prepared; public manifest copied.')
