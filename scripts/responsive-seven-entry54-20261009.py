"""One bounded public seven-game trial. Simultaneous public admissions; existing service alone drives tournaments."""
import datetime, json, os, pathlib, subprocess, time, urllib.request, sys, re

root = pathlib.Path(__file__).resolve().parents[1]
run = sys.argv[1];assert re.fullmatch(r'r2seven28',run)
directory = root/'artifacts/qualification'/run
directory.mkdir(exist_ok=False)
node = r'C:/Users/wwwle/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
pwsh = r'C:/Users/wwwle/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe'
names = [run+'a'+str(i) for i in range(4)] + [run+'hc',run+'hx']
started = time.time(); deadline = int((started+20*60)*1000)
config = dict(runs=names,deadline=deadline,humanFirst=True,humanByRun=True)
(directory/'barrier.json').write_text(json.dumps(config))
report = dict(measurement='known-start and expiry exact geometry with live confirmation',noConcurrentBackupOrBuild=True,rpc='edc24df',web='1c6dd1d',engine='5f8cab3',sponsor='a4f12ec',reader='cf0b458',archive='dc05ba9',freshVirtualCredentials=True,startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),deadline=deadline,passed=False,children=[])
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
    actual=subprocess.check_output(['ssh','pongit','docker','inspect','--format','{{.Image}}','pongit-arcade-five-arcade-web-1'],text=True,timeout=20).strip()
    assert actual=='sha256:b246a10a913c0c9b21f0b02c0395c3f7dd388c60cca113379d6ab7f71f9bfbcb','Candidate web is not deployed'
    report['webImage']=actual
    sponsor=subprocess.check_output(['ssh','pongit','docker','inspect','--format','{{.Image}}','pongit-arcade-five-sponsor-1'],text=True,timeout=20).strip()
    assert sponsor=='sha256:8946aa6431eb820131a76be5fa3021a0dfe47e6de956f6ee18ed399d4d7e7e8f','Candidate sponsor is not deployed'
    report['sponsorImage']=sponsor
    engine=subprocess.check_output(['ssh','pongit','docker','inspect','--format','{{.Image}}','pongit-arcade-five-engines-1'],text=True,timeout=20).strip()
    assert engine=='sha256:cacaab42f26f7d2e2b5417364c13a7e686e767c0a6ea1172a8808e1fae984934','Candidate engine is not deployed'
    report['engineImage']=engine
    current=get('config');assert current['rulesVersion']==17 and current['maxMatches']==5 and current['enabled'] and current['tournamentsEnabled']
    official={x['agent'].lower():x for x in get('catalog?limit=32')['items'] if x.get('official')}
    assert len(official)==8
    report['archetypeSelection']='Same official archetype as the next fresh competitive fixture; NOVA-only tests are separate';save()
    for i,name in enumerate(names):
        env=os.environ.copy();env.pop('PONG_HUMAN_RESTORE_PRIVATE_PATH',None);env['PONG_BROWSER_BARRIER']=str(directory)
        env['PONG_CATALOGUE_RECEIPT_PROBE']='read-only';env['PONG_CATALOGUE_NODE_DIAGNOSTICS']='read-only'
        if i<4:
            args=[pwsh,'-NoProfile','-File','scripts/integrity-browser-run-20261007.ps1','-Run',name,'-GameMode',str(i%2),'-Browser','chrome' if i%2==0 else 'msedge','-Width','768']
        else:
            args=[pwsh,'-NoProfile','-File','scripts/integrity-pvp-run-20261007.ps1','-Run',name,'-Manifest','artifacts/responsive-20261008-r2/human-public-recovered.json','-Mode','classic' if i==4 else 'chaos','-Browser','chrome' if i==4 else 'msedge']
        # Retain the selected player/observer video. Every other canvas still
        # records full frame/input traces, without twelve simultaneous encoders.
        if i!=0:args+=['-NoVideo']
        launch(name,args,env)
    while int(time.time()*1000)<deadline:
        assert all(p.poll() is None for _,p in children),'A browser failed before coordinated admission; preserve its report'
        if all((directory/(n+'.ready.json')).exists() for n in names):break
        time.sleep(1)
    else:raise RuntimeError('Original preparation deadline expired')
    report['readyAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
    # Do not spend the short human game's lifetime waiting for the minute
    # between tournaments. Wait for a genuinely fresh competitive fixture
    # BEFORE releasing either human admission. No match timer is changed.
    while int(time.time()*1000)<deadline:
        assert all(p.poll() is None for _,p in children),'A prepared browser exited'
        env=os.environ.copy();env['PONG_TOURNAMENT_WINDOW']='read-only-public';env.pop('PONG_TOURNAMENT_ARCHETYPE',None)
        probe=subprocess.run([node,'node_modules/tsx/dist/cli.mjs','scripts/responsive-tournament-window-20261008.ts'],cwd=root,env=env,text=True,capture_output=True,timeout=40)
        if probe.returncode==0:
            window=json.loads(probe.stdout.strip().splitlines()[-1]);report['beforeHumanWindow']=window;save()
            if window.get('fresh'):break
        time.sleep(2)
    else:raise RuntimeError('Original fresh-tournament preparation bound expired')
    # Admit the two human rooms first. Their setup is slower than a natural
    # bot match; simultaneous setup previously missed overlap entirely. Games
    # and their clocks are never delayed or extended by this coordination.
    releaseHuman=dict(go=True,deadline=deadline,readyCount=len(names),bot='NOVA',phase='human-admission',at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    (directory/'release-human-hx.json').write_text(json.dumps(releaseHuman))
    # Chaos creates a room before its consents; ranked Classic has no such setup.
    # Start Classic once the two Chaos players have actually joined. Never hold
    # a consent, countdown or admitted match to manufacture overlap.
    while int(time.time()*1000)<deadline:
        assert all(p.poll() is None for _,p in children),'A browser exited before Chaos room preparation'
        if (directory/(names[-1]+'.room-joined.json')).exists():break
        time.sleep(.25)
    else:raise RuntimeError('Original Chaos room preparation deadline expired')
    releaseHuman['at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    (directory/'release-human-hc.json').write_text(json.dumps(releaseHuman))
    report['classicReleasedAfterChaosRoom']=releaseHuman['at'];save()
    while int(time.time()*1000)<deadline:
        assert all(p.poll() is None for _,p in children),'A browser exited before both humans were playing'
        if all((directory/(n+'.playing.json')).exists() for n in names[-2:]):break
        time.sleep(.25)
    else:raise RuntimeError('Original human admission bound expired')
    report['humansPlayingAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
    # Acquire a fresh live tournament after both human rooms are playing.
    # Use that fixture's actual official archetype for all four independent copies.
    # Never wait for already resolved NOVA fixtures or modify a tournament.
    # No keeper operation, artificial extension or changed fixture is involved.
    fixture=None
    while int(time.time()*1000)<deadline:
        assert all(p.poll() is None for _,p in children),'A prepared browser exited'
        env=os.environ.copy();env['PONG_TOURNAMENT_WINDOW']='read-only-public';env.pop('PONG_TOURNAMENT_ARCHETYPE',None)
        probe=subprocess.run([node,'node_modules/tsx/dist/cli.mjs','scripts/responsive-tournament-window-20261008.ts'],cwd=root,env=env,text=True,capture_output=True,timeout=40)
        if probe.returncode==0:
            window=json.loads(probe.stdout.strip().splitlines()[-1]);report['lastTournamentWindow']=window;save()
            live=window.get('summary',{})
            if window.get('fresh') or (live.get('phase')==2 and live.get('pause')==0 and int(live.get('elapsedUs','999999999'))<=240000000 and max(live.get('scoreA',7),live.get('scoreB',7))<=4):
                candidates=[official[a.lower()] for a in [window['fixture']['a'],window['fixture']['b']] if a.lower() in official]
                if candidates:
                    house=sorted(candidates,key=lambda x:x['agent'].lower())[0];fixture=window['fixture'];report['requiredArchetype']=house['agent'];save();break
        else:report['windowReadFailedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
        time.sleep(2)
    assert fixture,'No actual fresh hosted tournament within the original deadline'
    # Select the actual current competitive archetype at this point, not the
    # fixture that was playing before human setup. The observer independently
    # requires thirty seconds of seven-way live progression on exact refs.
    assert fixture and house['agent'].lower() in [fixture['a'].lower(),fixture['b'].lower()]
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
    # Only clients still before their own admission barrier observe this file.
    # Already admitted matches keep running to their original natural bound.
    (directory/'abort.json').write_text(json.dumps(dict(deadline=deadline,error=str(error),at=datetime.datetime.now(datetime.timezone.utc).isoformat())))
finally:
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();save()
    for handle in handles:handle.close()
    print(json.dumps({k:report[k] for k in ['passed','error','exitCodes'] if k in report}))
    # No process kill: an admitted test match retains its original natural bound.
