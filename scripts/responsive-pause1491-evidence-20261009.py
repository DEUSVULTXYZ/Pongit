"""Summarize preserved browser and independent read-only evidence; no writes to a chain."""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/validation/responsive-pause1491-20261009.json'
assert not OUT.exists(), 'Preserve original diagnosis'
sources = {}
def load(relative):
    path = ROOT / relative
    sources[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    return json.loads(path.read_text(encoding='utf-8-sig'))

browser = load('artifacts/qualification/catalogue-r2final56b1/report.json')
journal = load('artifacts/responsive-20261008-r2/pause1491-engine-metadata.json')
receipt = next(r for r in browser['receipts'] if r['ms'] > 500)
assert receipt['hash'] == '0x049c7300b21e6bc9e406fd56e933b40536bb082b1a4847271b74952fa47ebd4f'
engine = next(r for r in journal['rows'] if r['elapsed_ms'] > 500)
assert int(engine['block'], 16) == int(receipt['block'], 16) + 1
health = min(browser['health'], key=lambda r: abs(r['at'] - receipt['sentAt']))
sent = sorted(r['sentAt'] for r in browser['receipts'])
peak = max(sum(t <= other < t + 1000 for other in sent) for t in sent)
assert peak < 100 and health['pendingDiffs'] < 233 and not health['sendGated']
assert browser['naturalEnded'] and not browser['passed']
probes = []
for run in [1, 2]:
    for role in ['windows', 'vps']:
        probe = load(f'artifacts/responsive-20261008-r2/node-read-probe-{run}-{role}.json')
        for node in probe['nodes']:
            samples = node['samples'][1:]  # Report cold connection separately.
            ms = sorted(s['ms'] for s in samples)
            probes.append(dict(run=run, role=role, node=node['node'], samples=len(samples),
                startedAt=probe['startedAt'], finishedAt=probe['finishedAt'],
                coldMs=node['samples'][0]['ms'], p95Ms=ms[math.ceil(.95*len(ms))-1], maxMs=max(ms),
                errors=sum('error' in s for s in samples),
                writesObserved=node['samples'][-1]['lock']['sends']['count']-node['samples'][0]['lock']['sends']['count'],
                stalls=[{k:s.get(k) for k in ['at','ms','requestId','ephemeralBlock','pendingDiffs']} for s in samples if s['ms'] > 500]))

report = dict(qualificationPassed=False, ref=browser['ref'], rulesVersion=browser['rulesVersion'],
    naturalEnded=True, originalError=browser['error'], heartbeat=receipt, independentEngineCommand=engine,
    concurrentHealth=health, peakPlayerCommandsPerSecond=peak, connection=browser['connectionDiagnostics'],
    readOnlyProbes=probes, sources=sources,
    conclusion='A live request stalled for about one second while an independent VPS command to the same arena stalled into the adjacent block. The contract then correctly enforced its existing 500ms presence limit. No PONGIT queue, batch-full, signer-rate, clock-fence or long execution-lock evidence explains this interval. The exact cause behind the hosted endpoint remains unresolved.',
    limits='The later bounded probes do not reproduce the simultaneous one-second stall. They detect independent VPS-path tail latency, including on an idle node. These observations are not proof that every rare stall has the same cause. No acceptance gate is waived.',
    requestedProviderEvidence='Trace the two receipt hashes and Fly request 01M4G0DG61C8NY5GK379EWQ1W0-cdg on il2-eu-21a573b3c39265d2 during 2026-10-09 09:37:52..09:37:58 UTC. Inspect request arrival/execution, process scheduling and upstream waits without changing or closing the delegation.')
OUT.write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps({'path':str(OUT),'qualificationPassed':False,'sources':len(sources),'probes':len(probes)}))
