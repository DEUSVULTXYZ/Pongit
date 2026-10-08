"""One bounded public seven-game trial. Existing service alone drives tournaments."""
import datetime, json, os, pathlib, subprocess, time, urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
run = 'r2seven1'
directory = root/'artifacts/qualification'/run
directory.mkdir(exist_ok=False)
node = r'C:/Users/wwwle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
pwsh = r'C:/Users/wwwle/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
names = [run+'a'+str(i) for i in range(4)] + [run+'hc',run+'hx']
started = time.time(); deadline = int((started+20*60)*1000)
config = dict(runs=names,deadline=deadline)
(directory/'barrier.json').write_text(json.dumps(config))
report = dict(startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),deadline=deadline,passed=False,children=[])
children=[];handles=[]
def save():
    (directory/'coordinator.json').write_text(json.dumps(report,indent=2))
def get(path):
    with urllib.request.urlopen('https://pongit.xyz/api/agents/'+path,timeout=10) as response:return json.load(response)
def launch(name,args,env):
    log=(directory/(name+'.log')).open('w');handles.append(log)
    p=subprocess.Popen(args,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
    children.append((name,p));report['children'].append(dict(run=name,pid=p.pid));save()
try:
    current=get('config');assert current['rulesVersion']==17 and current['maxMatches']==5 and current['enabled'] and current['tournamentsEnabled']
    for i,name in enumerate(names):
        env=os.environ.copy();env['PONG_BROWSER_BARRIER']=str(directory)
        if i==5:env['PONG_HUMAN_PROFILE_DELAY_MS']='50000'
        if i<4:
            args=[pwsh,'-NoProfile','-File','scripts/integrity-browser-run-20261007.ps1','-Run',name,'-GameMode',str(i%2),'-Browser','chrome' if i%2==0 else 'msedge','-Width','768']
        else:
            args=[pwsh,'-NoProfile','-File','scripts/integrity-pvp-run-20261007.ps1','-Run',name,'-Manifest','artifacts/responsive-20261008-r2/human-public-recovered.json','-Mode','classic' if i==4 else 'chaos','-Browser','chrome' if i==4 else 'msedge']
        launch(name,args,env)
    while int(time.time()*1000)<deadline:
        assert all(p.poll() is None for _,p in children),'A browser failed before coordinated admission; preserve its report'
        if all((directory/(n+'.ready.json')).exists() for n in names):break
        time.sleep(1)
    else:raise RuntimeError('Original preparation deadline expired')
    report['readyAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
    # Observe a fresh tournament match to leave enough time for all six browser
    # admissions. Never start, alter or cancel a tournament fixture here.
    previous=None;fixture=None
    while int(time.time()*1000)<deadline:
        live=get('live');matches=live.get('matches',live.get('items',[]))
        active=[m for m in matches if int(m.get('tournament') or 0)>0]
        if active:
            candidate=active[0];ref=candidate['ref'];key=(ref['app'].lower(),ref['epoch'],ref['id'])
            if previous is None:previous=key
            elif key!=previous:fixture=candidate;break
        time.sleep(2)
    assert fixture,'No fresh tournament fixture within original deadline'
    catalog=get('catalog')['items'];house=next(x for x in catalog if x.get('official') and x['agent'].lower() in [fixture['a'].lower(),fixture['b'].lower()])
    release=dict(go=True,deadline=deadline,readyCount=len(names),bot=house['name'],tournament=fixture['tournament'],ref=fixture['ref'],at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    observerEnv=os.environ.copy();observerEnv.update(PONG_SEVEN_WAY='read-only-public-responsive',PONG_SEVEN_WAY_RUN=run,
        PONG_SEVEN_WAY_DEADLINE=datetime.datetime.fromtimestamp(time.time()+15*60,datetime.timezone.utc).isoformat(),
        PONG_RESPONSIVE_IMPORT_PROOF=str(root/'artifacts/responsive-20261008-r2/verify-import-1.json'))
    launch('observer',[node,'node_modules/tsx/dist/cli.mjs','scripts/responsive-seven-way-observer.ts'],observerEnv)
    (directory/'release.json').write_text(json.dumps(release));report['release']=release;save()
    # The browser harnesses keep their own natural seven-minute game bounds.
    while time.time()<started+30*60 and any(p.poll() is None for _,p in children):time.sleep(2)
    assert all(p.poll() is not None for _,p in children),'Original trial bound reached; inspect retained processes, do not extend'
    report['exitCodes']={name:p.returncode for name,p in children}
    assert all(p.returncode==0 for _,p in children),'One or more real browser gates failed'
    report['passed']=True
except Exception as error:
    report['error']=str(error)
finally:
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
    for handle in handles:handle.close()
    print(json.dumps({k:report[k] for k in ['passed','error','exitCodes'] if k in report}))
    # No process kill: an admitted test match retains its original natural bound.
