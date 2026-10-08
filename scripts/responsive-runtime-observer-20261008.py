"""Read-only runtime identity/resource proof, complementary to game qualification.

Never launches services, signs a transaction or saves Docker environment values.
Actual container identities are checked, not only an exported source directory.
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import signal
import subprocess
import time

AGENT_ROLES = ['reader', 'sponsor', 'admission', 'archive', 'maintenance', 'engines', 'arcade-web']
INDEX_ROLES = ['responsive', 'reship-repeat', 'reship', 'human-v3', 'sync', 'legacy', 'live', 'shared']
NAMES = (['pongit-arcade-five-' + r + '-1' for r in AGENT_ROLES]
         + ['pongit-arcade-five-' + r + '-indexer-1' for r in INDEX_ROLES]
         + ['pongit-relayer-1', 'pongit-rpc-1', 'pongit-caddy-1', 'pongit-reusable-shared-hasura-human14'])
CHANGES = {'start', 'die', 'restart', 'destroy', 'update', 'pause', 'unpause', 'kill', 'rename'}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def identity(row):
    # Config/HostConfig can contain credentials. Only their irreversible digest
    # leaves memory; do not include them in errors, reports or console output.
    mounts = sorted([{'type': m['Type'], 'source': m['Source'], 'target': m['Destination'],
                      'readOnly': not m['RW']} for m in row['Mounts']], key=lambda m: m['target'])
    state = row['State']
    return dict(id=row['Id'], image=row['Image'], startedAt=state['StartedAt'],
                restartCount=row['RestartCount'], running=state['Running'], paused=state['Paused'],
                oom=state['OOMKilled'], configHash=digest([row['Config'], row['HostConfig'], mounts]))


def differences(before, after):
    return [name for name in sorted(set(before) | set(after)) if before.get(name) != after.get(name)]


def command(args, timeout=15):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError('read-only-command-failed')
    return p.stdout


def snapshot():
    rows = json.loads(command(['docker', 'inspect', *NAMES]))
    result = {r['Name'].lstrip('/'): identity(r) for r in rows}
    assert set(result) == set(NAMES), 'missing-runtime-role'
    assert all(r['running'] and not r['paused'] and not r['oom'] for r in result.values()), 'unhealthy-runtime-role'
    return result


def immutable_files(paths):
    result = {}
    for path in paths:
        p = pathlib.Path(path).resolve(strict=True)
        assert p.is_relative_to('/opt/pongit') and p.is_file(), 'invalid-runtime-file'
        assert p.stat().st_size <= 8 * 1024 * 1024, 'unexpected-runtime-file-size'
        result[str(p)] = hashlib.sha256(p.read_bytes()).hexdigest()
    return result


def resources():
    rows = [json.loads(line) for line in command(['docker', 'stats', '--no-stream', '--format', '{{json .}}', *NAMES]).splitlines()]
    # Deliberately select public counters; no generic Docker output persistence.
    counters = [{k: r.get(k) for k in ['Name', 'CPUPerc', 'MemUsage', 'MemPerc', 'NetIO', 'BlockIO', 'PIDs']} for r in rows]
    mem = pathlib.Path('/proc/meminfo').read_text().splitlines()
    available = int(next(x.split()[1] for x in mem if x.startswith('MemAvailable:'))) * 1024
    import os
    fs = os.statvfs('/opt/pongit')
    used = (fs.f_blocks - fs.f_bfree) * fs.f_frsize
    free = fs.f_bavail * fs.f_frsize
    return dict(containers=counters, memoryAvailableBytes=available, diskUsedBytes=used,
                diskAvailableBytes=free, diskUsablePercent=used / (used + free) * 100)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--scope', required=True, choices=['read-only-public-responsive'])
    parser.add_argument('--duration', type=int, required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--file', action='append', default=[])
    args = parser.parse_args()
    assert 60 <= args.duration <= 25 * 3600
    output = pathlib.Path(args.output).resolve()
    assert output.is_relative_to('/opt/pongit/tests') and not output.exists(), 'preserve-original-evidence'
    output.mkdir(parents=True)
    started = time.time()
    deadline = started + args.duration
    iso = lambda t: datetime.datetime.fromtimestamp(t, datetime.timezone.utc).isoformat()
    report = dict(startedAt=iso(started), deadline=iso(deadline), scope=args.scope, passed=False,
                  note='Runtime identities/resources only; not browser, game, settlement or 24-hour acceptance.',
                  errors=[], changes=[], samples=0)
    report_path = output / 'report.json'
    stopped = False

    def stop(*_):
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    def save():
        temporary = output / 'report.pending.json'
        temporary.write_text(json.dumps(report, indent=2))
        temporary.replace(report_path)

    try:
        report['stage'] = 'baseline'
        baseline = snapshot()
        file_hashes = immutable_files(args.file)
        report.update(baseline=baseline, files=file_hashes)
        save()
        while not stopped:
            report['stage'] = 'sample'
            at = time.time()
            current = snapshot()
            changes = differences(baseline, current)
            files = immutable_files(args.file)
            changes += differences(file_hashes, files)
            if changes:
                report['changes'].append(dict(at=iso(at), rolesOrFiles=changes))
            sample = dict(at=iso(at), identitiesUnchanged=not changes, **resources())
            with (output / 'samples.ndjson').open('a') as f:
                f.write(json.dumps(sample) + '\n')
            report['samples'] += 1
            report['lastAt'] = iso(at)
            save()
            if changes or time.time() >= deadline:
                break
            # Bound shutdown responsiveness without extending the original run.
            wake = min(deadline, time.time() + 30)
            while not stopped and time.time() < wake:
                time.sleep(max(0, min(1, wake - time.time())))
        ended = time.time()
        report['stage'] = 'events'
        events = ['docker', 'events', '--since', iso(started), '--until', iso(ended), '--format', '{{json .}}']
        for name in NAMES:
            events += ['--filter', 'container=' + name]
        events += ['--filter', 'type=container']
        # Detect even a brief restart/replacement between snapshots. Never save
        # event attributes: they can contain labels or command arguments.
        transitions = []
        for line in command(events, timeout=30).splitlines():
            e = json.loads(line)
            if e.get('Action') in CHANGES:
                transitions.append({k: e.get(k) for k in ['timeNano', 'Action', 'id']})
        report.update(transitions=transitions, stopped=stopped, durationSeconds=ended - started)
        report['passed'] = not stopped and ended >= deadline and not report['changes'] and not transitions
        report['stage'] = 'complete'
    except Exception as error:
        # Exception messages can contain Docker output. Persist type only.
        report['errors'].append(dict(at=iso(time.time()), type=type(error).__name__))
    finally:
        report['finishedAt'] = iso(time.time())
        save()
    print(json.dumps({k: report[k] for k in ['passed', 'samples', 'startedAt', 'finishedAt']}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
