"""Prepare a bounded read-only qualification monitor from actual running sources."""
import copy, datetime, hashlib, io, json, os, pathlib, subprocess, tarfile
release=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
root=pathlib.Path('/opt/pongit/tests/responsive-soak-30-20261008')
assert int(next(x.split()[1] for x in pathlib.Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))>1572864,'Preserve resident memory reserve'
root.mkdir(exist_ok=False);root.chmod(0o755)
config=json.loads((release/'live/agent-compose.json').read_text())
roles={'reader':'reader','sponsor':'sponsor','admission':'admission','archive':'archive','maintenance':'maintenance','controllers':'engines'}
sources={};exported={};identities={}
for role,service in roles.items():
    name='pongit-arcade-five-'+service+'-1'
    actual=json.loads(subprocess.check_output(['docker','inspect',name]))[0]
    assert actual['State']['Running'] and actual['Image']==config['services'][service]['image']
    assert not any(m['Destination'].startswith('/app/') for m in actual['Mounts']),'Explicit source override audit required'
    image=actual['Image'];entry='scripts/agent-reusable-process.mjs'
    if image not in exported:
        folder=root/('sources-'+role);folder.mkdir();folder.chmod(0o755)
        js="import {sourceClosure} from './scripts/agent-soak-rules.ts';const c=await sourceClosure(['scripts/agent-reusable-process.mjs','scripts/agent-series-soak.ts']);if(c.unresolved.length)throw Error('Unresolved source');console.log(JSON.stringify([...new Set([...c.paths,'package-lock.json'])]));"
        r=subprocess.run(['docker','exec','-i',name,'node','--import','tsx','--input-type=module'],input=js,text=True,capture_output=True,timeout=60)
        assert r.returncode==0,'Source graph failed'
        paths=json.loads(r.stdout.strip().splitlines()[-1]);assert paths and all(not p.startswith('/') and '..' not in p.split('/') for p in paths)
        data=subprocess.run(['docker','exec','-i',name,'tar','czf','-','-T','-'],input=('\n'.join(paths)+'\n').encode(),capture_output=True,timeout=90)
        assert data.returncode==0,'Source export failed'
        archive=root/(role+'-sources.tar.gz');archive.write_bytes(data.stdout)
        with tarfile.open(fileobj=io.BytesIO(data.stdout)) as package:package.extractall(folder,filter='data')
        for p in folder.rglob('*'):p.chmod(0o755 if p.is_dir() else 0o644)
        exported[image]={'folder':str(folder),'archiveSha256':hashlib.sha256(data.stdout).hexdigest(),'files':len(paths)}
    identities[role]={'container':name,'image':image,'startedAt':actual['State']['StartedAt'],**exported[image]}
    sources[role]={'root':'/sources/'+role,'entries':[entry]}
(root/'sources.json').write_text(json.dumps(sources,indent=2));(root/'sources.json').chmod(0o644)
(root/'source-identities.json').write_text(json.dumps(identities,indent=2))
diagnostics=root/'diagnostics';diagnostics.mkdir();os.chown(diagnostics,1000,1000)
proof=release/'agents/evidence/verify-import-1.json';assert json.loads(proof.read_text())['passed']
s=copy.deepcopy(config['services']['reader']);s.pop('ports',None);s.pop('depends_on',None);s.pop('healthcheck',None)
s.update(container_name='pongit-responsive-soak-preflight30-1',restart='no',command=['node','--import','tsx','scripts/agent-series-soak.ts'],mem_limit='512m',cpus=.5)
s['volumes']=[{'type':'bind','source':str(release/'live/metadata'),'target':'/metadata','read_only':True},
 {'type':'bind','source':str(diagnostics),'target':'/diagnostics'},
 {'type':'bind','source':str(proof),'target':'/qualification/import-proof.json','read_only':True},
 {'type':'bind','source':str(root/'sources.json'),'target':'/qualification/sources.json','read_only':True}]
for role in sources:s['volumes'].append({'type':'bind','source':identities[role]['folder'],'target':'/sources/'+role,'read_only':True})
s['environment'].update(PONG_SERIES_SOAK='read-only-public-responsive',PONG_SERIES_SOAK_HOURS='0.025',PONG_SERIES_SOAK_API='https://pongit.xyz/api/',PONG_SERIES_SOAK_SOURCES='/qualification/sources.json',PONG_HUMAN_APPS=','.join(a['app'] for a in json.loads((release/'human/secrets/manifest.json').read_text())['arenas']))
out={'services':{'monitor':s},'networks':{k:{'name':v['name'],'external':True} for k,v in config['networks'].items()}}
path=root/'preflight.compose.private.json';path.write_text(json.dumps(out,indent=2));path.chmod(0o600)
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Ninety-second read-only monitor preflight, not 24-hour qualification','sources':identities,'passed':False}
(root/'preflight-start.json').write_text(json.dumps(report,indent=2))
subprocess.run(['docker','compose','-p','pongit-responsive-soak-preflight30','-f',str(path),'up','-d','monitor'],check=True,timeout=90)
report['passed']=True;(root/'preflight-start.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'prepared':True,'container':s['container_name'],'sourceImages':len(exported),'durationSeconds':90}))
