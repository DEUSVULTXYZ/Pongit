"""Stop only ten old, unexposed web processes. Retain containers/images/volumes.

No gameplay writer, database, indexer, Caddy, public web or loopback preview is
included. A route, established connection or external container reference vetoes
the whole action before any process is stopped. Restart by retained exact IDs.
"""
import datetime,hashlib,json,pathlib,re,subprocess
names=['pongit-web-1','pongit-human-migration-web-0c44f08','pongit-series3-web-359523f',
 'pongit-independent-ready-web-359523f','pongit-independent-events-web-live','independent-events-web',
 'pongit-rules9-web','pongit-pool-player-ui','pongit-rules8-web','pongit-agent-ui-20260913']
output=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/evidence/unused-web-stop-1.json')
assert not output.exists(),'Preserve original stop evidence'
def run(args):return subprocess.check_output(args,text=True,timeout=30)
ids=run(['docker','ps','-q']).split();rows=json.loads(run(['docker','inspect',*ids]));byname={r['Name'].lstrip('/'):r for r in rows}
routes=run(['docker','exec','pongit-caddy-1','cat','/etc/caddy/Caddyfile'])
targets=[byname[n] for n in names];targetids={r['Id'] for r in targets}
for r in targets:
 assert r['State']['Running'] and not r['HostConfig'].get('PortBindings')
 assert r['State']['StartedAt']<'2026-10-01'
 aliases={r['Name'].lstrip('/')}
 for network in r['NetworkSettings']['Networks'].values():aliases.update(network.get('Aliases') or [])
 assert not any(re.search(r'(?<![\w-])'+re.escape(a)+r':\d',routes) for a in aliases),'Old web is still routed'
 for peer in rows:
  if peer['Id'] in targetids:continue
  # Inspect in memory only. Never persist environment contents.
  text='\n'.join(peer['Config'].get('Env') or [])
  assert not any(re.search(r'://'+re.escape(a)+r'(?=[:/]|$)',text) for a in aliases),'Old web still has a consumer'
 net=run(['docker','exec',r['Id'],'cat','/proc/net/tcp','/proc/net/tcp6'])
 assert not any(len(line.split())>3 and line.split()[3]=='01' for line in net.splitlines()),'Old web has an established connection'
def available():return int(next(l.split()[1] for l in pathlib.Path('/proc/meminfo').read_text().splitlines() if l.startswith('MemAvailable:')))*1024
report=dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),passed=False,scope='Ten old unexposed web processes only. All containers, images, volumes, ports and databases retained.',memoryBefore=available(),targets=[])
for r in targets:report['targets'].append(dict(name=r['Name'].lstrip('/'),id=r['Id'],image=r['Image'],startedAt=r['State']['StartedAt'],configHash=hashlib.sha256(json.dumps([r['Config'],r['HostConfig']],sort_keys=True).encode()).hexdigest(),stopped=False))
def save():output.write_text(json.dumps(report,indent=2))
save()
try:
 for entry in report['targets']:
  current=json.loads(run(['docker','inspect',entry['id']]))[0]
  assert current['State']['Running'] and current['State']['StartedAt']==entry['startedAt'] and current['Image']==entry['image']
  subprocess.run(['docker','stop','--time','15',entry['id']],check=True,timeout=30,capture_output=True)
  current=json.loads(run(['docker','inspect',entry['id']]))[0]
  assert not current['State']['Running'] and not current['State']['OOMKilled']
  entry.update(stopped=True,exitCode=current['State']['ExitCode']);save()
 report['passed']=True
finally:
 report['memoryAfter']=available();report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
 print(json.dumps({k:report[k] for k in ['passed','memoryBefore','memoryAfter','finishedAt']}))
