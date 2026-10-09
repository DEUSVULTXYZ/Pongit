"""Bounded, read-only health probes with independent persistent connections.

No session creation, transaction, credential or application-state mutation.
"""
import argparse
import concurrent.futures
import datetime
import http.client
import json
import pathlib
import time

NODES = ['21a573b3c39265d2', '077df08fa9ff9bbf']
ALLOWED_NODES = NODES + ['4e9fa437576b1b2b']

def probe(node, seconds):
    connection = http.client.HTTPSConnection(f'il2-eu-{node}.fly.dev', timeout=4)
    records = []
    deadline = time.monotonic() + seconds
    due = time.monotonic()
    while time.monotonic() < deadline:
        started = time.monotonic()
        row = {'at': time.time() * 1000}
        try:
            connection.request('GET', '/health', headers={'Accept': 'application/json'})
            response = connection.getresponse()
            body = response.read()
            row.update(status=response.status, ms=(time.monotonic()-started)*1000,
                       requestId=response.getheader('fly-request-id'))
            if response.status == 200:
                health = json.loads(body)
                for key in ['app', 'epoch', 'chainId', 'ok', 'sendGated', 'ephemeralBlock',
                            'execTimestamp', 'committedBatches', 'pendingDiffs', 'clock', 'lock', 'commits']:
                    row[key] = health.get(key)
        except Exception as error:
            row.update(error=type(error).__name__, ms=(time.monotonic()-started)*1000)
            connection.close()
            connection = http.client.HTTPSConnection(f'il2-eu-{node}.fly.dev', timeout=4)
        records.append(row)
        due += 0.25
        time.sleep(max(0, min(due-time.monotonic(), deadline-time.monotonic())))
        if due < time.monotonic()-0.25:
            due = time.monotonic()
    connection.close()
    return {'node': node, 'samples': records}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--role', choices=['windows', 'vps'], required=True)
    parser.add_argument('--seconds', type=int, default=180)
    parser.add_argument('--node', choices=ALLOWED_NODES, action='append')
    args = parser.parse_args()
    assert 10 <= args.seconds <= 300
    nodes = args.node or NODES
    assert 1 <= len(nodes) <= 2 and len(set(nodes)) == len(nodes)
    output = pathlib.Path(args.output)
    assert not output.exists(), 'Preserve original probe'
    report = {'role': args.role, 'readOnly': True, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'durationSeconds': args.seconds, 'cadenceMs': 250}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        report['nodes'] = list(pool.map(lambda node: probe(node, args.seconds), nodes))
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'role': args.role, 'path': str(output), 'samples': [len(n['samples']) for n in report['nodes']],
                      'slowOver500ms': [sum(s['ms'] > 500 for s in n['samples'][1:]) for n in report['nodes']]}))
