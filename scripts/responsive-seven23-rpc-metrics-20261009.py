import datetime,json,pathlib,subprocess,time,urllib.request
out=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/evidence/rpc-seven23-samples.ndjson');assert not out.exists()
net=json.loads(subprocess.check_output(['docker','inspect','--format','{{json .NetworkSettings.Networks}}','pongit-rpc-1']))
ip=next(v['IPAddress'] for v in net.values() if v.get('IPAddress'));deadline=time.time()+900;count=0
with out.open('x') as f:
 while time.time()<deadline:
  at=datetime.datetime.now(datetime.timezone.utc).isoformat()
  try:
   with urllib.request.urlopen('http://'+ip+':8545/health',timeout=4) as r:body=json.load(r)
   sample={'at':at,**{k:body.get(k) for k in ['waiting','queued','throttled','upstreams','timing','coalescedForegroundPromotions']}}
  except Exception as e:sample={'at':at,'error':type(e).__name__}
  f.write(json.dumps(sample)+'\n');f.flush();count+=1;time.sleep(min(5,max(0,deadline-time.time())))
print(json.dumps({'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'samples':count,'scope':'read-only RPC queue timings; no extra upstream calls'}))
