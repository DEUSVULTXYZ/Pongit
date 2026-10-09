"""Prospective fixed admission cohort. No changed product or per-game reports.

Include the FIRST four candidate55 admissions (trial29) and exactly five new
four-client waves. No failed or slow admission may be omitted. The target is
population p95 <=8s, not an 8s maximum. Every new game's non-admission gates
must pass; prior trial29 measurement failures remain separately documented.
"""
import datetime, hashlib, json, math, pathlib, subprocess, time

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/qualification/cohort55'
WAVES=['r2seven'+str(i) for i in range(30,35)]
utc=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
def load(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def gameplay(r):
    return (r.get('naturalEnded') is True and r.get('mockedNetwork') is False
        and r.get('normalNetworkQualification') is True
        and all(r.get('performance',{}).get(k) is True for k in ['localInput','confirmedInput','player','spectator'])
        and all(r.get('naturalGates',{}).get(k) is True for k in ['noPause','noResume','noResync','peer','player','spectator','executionClock'])
        and r.get('collisions',{}).get('unconfirmed')==[]
        and r.get('sustained',{}).get('held',{}).get('outsideTarget')==0
        and r.get('sustained',{}).get('stopping',{}).get('maxDrift',999)<=6
        and r.get('deliveryEvidence',{}).get('unresolved')==[])

def main():
    normal=ROOT/'artifacts/responsive-20261008-r2/final-browser-series-55.json'
    assert load(normal)['passed'] and len(load(normal)['completed'])==7
    assert not OUT.exists(),'Preserve original prospective cohort'
    for wave in WAVES:assert not (ROOT/'artifacts/qualification'/wave).exists()
    OUT.mkdir();report=dict(startedAt=utc(),passed=False,definition='All 24 candidate55 concurrent admissions: trial29 plus five fixed waves. Nearest-rank p95; no dropped samples.',
        waves=WAVES,normalReportSha256=sha(normal),admissions=[],completed=[],errors=[])
    state=OUT/'report.json'
    def save():state.write_text(json.dumps(report,indent=2),encoding='utf-8')
    def sample(run):
        p=ROOT/'artifacts/qualification'/('catalogue-'+run)/'report.json';r=load(p)
        assert isinstance(r.get('admissionMs'),(int,float)) and r['admissionMs']>0
        return dict(run=run,ms=r['admissionMs'],passed=r['passed'],gameplay=gameplay(r),sha256=sha(p))
    try:
        for i in range(4):report['admissions'].append(sample('r2seven29a'+str(i)))
        save();deadline=time.time()+150*60
        for wave in WAVES:
            assert time.time()<deadline,'Original cohort bound'
            with (OUT/(wave+'.log')).open('x',encoding='utf-8') as log:
                result=subprocess.run(['C:/Python313/python.exe','scripts/responsive-seven-cohort55-20261009.py',wave],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
            coordinator=ROOT/'artifacts/qualification'/wave/'coordinator.json'
            c=load(coordinator)
            assert c.get('exitCodes') is not None,'A trial did not drain naturally; inspect existing clients'
            records=[sample(wave+'a'+str(i)) for i in range(4)]
            report['admissions']+=records
            # The unchanged harness preserves its stricter single-game <=8s
            # FAIL. Only the predeclared cohort evaluates the user's p95 gate.
            for record in records:
                r=load(ROOT/'artifacts/qualification'/('catalogue-'+record['run'])/'report.json')
                admission_only=(r.get('performance',{}).get('admission') is False
                    and r.get('error')=='A required performance gate failed; inspect admission/render measurements'
                    and r.get('errors')==[])
                assert record['gameplay'] and (r['passed'] or admission_only),'Non-admission browser gate failed'
            for suffix,folder in [('hc','browser-'),('hx','browser-chaos-')]:
                r=load(ROOT/'artifacts/independent-candidate'/(folder+wave+suffix)/'report.json')
                assert r['passed'] and r['naturalOnly'],'Human browser gate failed'
            report['completed'].append(dict(wave=wave,coordinatorSha256=sha(coordinator),exitCodes=c['exitCodes']))
            save()
        values=sorted(x['ms'] for x in report['admissions']);assert len(values)==24
        report['admissionP95Ms']=values[math.ceil(.95*len(values))-1];report['admissionMaxMs']=max(values)
        assert report['admissionP95Ms']<=8000,'All-sample admission p95 exceeds 8 seconds'
        seven=ROOT/'artifacts/qualification/seven-way-r2seven29/report.json'
        assert load(seven)['passed'];report['sevenWaySha256']=sha(seven)
        report['passed']=True
    except Exception as e:report['errors'].append(type(e).__name__+': '+str(e))
    finally:report['finishedAt']=utc();save();print(json.dumps({k:report[k] for k in ['passed','completed','errors','admissionP95Ms'] if k in report}),flush=True)
    return 0 if report['passed'] else 1
if __name__=='__main__':raise SystemExit(main())
