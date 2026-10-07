"""Summarize retained public browser evidence without rewriting any verdict."""
import datetime
import hashlib
import json
from pathlib import Path

root = Path('artifacts/qualification')
sources = {
    'stop-baseline-oct7': '04aa0c7',
    'stop-delay-baseline-oct7': '04aa0c7',
    'stop-after-home-oct7': '1c56d73',
    'stop-after-home2-oct7': '1c56d73',
    'stop-final-home-oct7': '1c56d73',
    'stop-public-home-oct7': 'c63f7c7',
}

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

rows = []
for folder in sorted(root.glob('catalogue-stop-*-oct7')):
    path = folder / 'report.json'
    if not path.exists():
        continue
    r = json.loads(path.read_text())
    run = r['run']
    source = sources.get(run, 'bcde17d' if run.startswith('stop-ack-') else '77082f2')
    sync, observer = r.get('sync', {}), r.get('spectatorSync', {})
    row = {key: r.get(key) for key in [
        'run', 'startedAt', 'finishedAt', 'passed', 'error', 'ref', 'actualMode',
        'channel', 'touchControls', 'viewportWidth', 'injectedNetworkDelayEachWayMs',
        'httpOnly', 'fault', 'virtualPrf', 'naturalMatch', 'result', 'admissionMs',
        'input', 'receiptP95Ms', 'confirmedInput', 'peerReception', 'naturalGates',
        'performance', 'liveness', 'unifiedArcadeKeys', 'checks', 'faults']}
    row['source'] = source
    row['render'] = {key: sync.get(key) for key in [
        'p95FrameMs', 'maxHoldMs', 'contractPauseMs', 'visibleResyncs', 'correction']}
    row['render'].update(
        stop={key: value for key, value in sync.get('stopping', {}).items() if key != 'stops'},
        paddleJumps=len(sync.get('paddleJumps', [])),
        snapshotJumps=len(sync.get('snapshotJumps', [])),
        frameGaps=len(sync.get('frameGaps', [])),
        observerMaxHoldMs=observer.get('maxHoldMs'),
        observerResyncs=observer.get('visibleResyncs'))
    evidence = [path, folder / 'sync-trace.json', folder / 'court.png']
    evidence += sorted((folder / 'video').glob('*.webm'))
    row['evidence'] = [{'path': p.as_posix(), 'sha256': digest(p), 'bytes': p.stat().st_size}
                       for p in evidence if p.exists()]
    rows.append(row)

header = root / 'mobile-header-oct7-public-30/report.json'
report = {
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'candidateSource': 'bcde17d',
    'completeQualification': False,
    'notes': [
        'All failed and intermediate reports remain failures.',
        'A published result is not yet final until its dispute conditions resolve.',
        'Virtual PRF and desktop touch emulation are not physical device tests.',
        'No 24-hour or complete project delivery claim.',
    ],
    'header': {'path': header.as_posix(), 'sha256': digest(header)},
    'games': rows,
}
deployment = Path('artifacts/controls-access-bcde17d')
report['deployment'] = {name: json.loads((deployment / (name + '.json')).read_text())
                        for name in ['build', 'deploy', 'public-health']}
final = [r for r in rows if r['source'] == 'bcde17d' and not r['fault']
         and r['injectedNetworkDelayEachWayMs'] == 0]
report['finalNormalSeries'] = {
    'matches': [r['ref'] for r in final],
    'overallPasses': sum(r['passed'] is True for r in final),
    'syncPasses': sum(bool(r['naturalGates']) and all(r['naturalGates'].values()) for r in final),
    'fullFiveMatchAcceptance': len(final) == 5 and all(r['passed'] for r in final),
}
output = Path('docs/validation/controls-access-mobile-20261007.json')
output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'output': str(output), 'reports': len(rows), 'sha256': digest(output)}))
