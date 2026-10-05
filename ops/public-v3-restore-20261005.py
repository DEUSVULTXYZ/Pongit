"""Restore the five dumps uploaded from the verified Windows backup copy."""
import datetime
import hashlib
import json
import pathlib
import secrets
import subprocess
import time

root = pathlib.Path('/opt/pongit/releases/human-v3-20261005')
inputs = root / 'restore-input'
manifest = json.loads((inputs / 'manifest.json').read_text())
for name, expected in manifest.items():
    if name.endswith('.dump'):
        assert hashlib.sha256((inputs / name).read_bytes()).hexdigest() == expected['sha256']
work = root / 'restore-final'
assert not work.exists(), 'Preserve earlier restore evidence'
work.mkdir(mode=0o700)
(work / 'data').mkdir()
password = work / 'postgres.private.env'
password.write_text('POSTGRES_PASSWORD=' + secrets.token_hex(32) + '\n')
password.chmod(0o600)
container = 'pongit-public-v3-restore-20261005'
report = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'passed': False, 'databases': []}
subprocess.run(['docker', 'run', '-d', '--name', container, '--network', 'none', '--memory', '512m', '--cpus', '0.5', '--restart', 'no', '--env-file', str(password), '-v', str(work / 'data') + ':/var/lib/postgresql/data', 'postgres:17-alpine'], check=True, stdout=subprocess.DEVNULL)
try:
    for _ in range(40):
        if subprocess.run(['docker', 'exec', container, 'pg_isready', '-U', 'postgres'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Isolated restore database did not start')
    for i, label in enumerate(['human', 'operator', 'agents', 'previous-agents', 'shared-index']):
        database = 'proof_' + str(i)
        subprocess.run(['docker', 'exec', container, 'createdb', '-U', 'postgres', database], check=True)
        with (inputs / (label + '.dump')).open('rb') as source, (work / (label + '.log')).open('w') as log:
            result = subprocess.run(['docker', 'exec', '-i', container, 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '-U', 'postgres', '-d', database], stdin=source, stdout=log, stderr=subprocess.STDOUT)
        assert result.returncode == 0, label + ' restore failed; keep its database and log'

        def query(sql):
            return subprocess.check_output(['docker', 'exec', container, 'psql', '-U', 'postgres', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], text=True).strip()

        tables = int(query("select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema')"))
        assert tables > 0
        checks = {'label': label, 'tables': tables, 'dumpSha256': manifest[label + '.dump']['sha256']}
        if label == 'human':
            rows = json.loads(query("select json_agg(row_to_json(x)) from (select lobby,count(*) as count from independent_history group by lobby) x"))
            counts = {x['lobby']: x['count'] for x in rows}
            assert counts['0x5dbea9692d443e04e1bd0b74fb307b079a5cb212'] == 25
            assert counts['0x527ccb705048820694a4ac209f83528db68fff3f'] >= 4
            checks['humanHistory'] = counts
        if label == 'operator':
            assert int(query("select count(*) from il_lifecycle_jobs where id like 'public-v3-role-reserve-20261005:%' and status='confirmed'")) == 2
            assert int(query("select count(*) from il_lifecycle_jobs where id like 'public-v3-rebalance-20261005:%' and status='confirmed'")) == 3
            checks['fundingJournalConfirmed'] = 5
        if label == 'shared-index':
            checks['newHumanResults'] = int(query('select count(*) from human_v3_20261005."Match"'))
            checks['allResults'] = int(query('select count(*) from pongit_history.matches_raw'))
            assert checks['newHumanResults'] >= 4 and checks['allResults'] >= 1196
        report['databases'].append(checks)
        # Only this successful scratch database is removed. Inputs, logs and
        # the isolated container/data directory are retained for audit.
        subprocess.run(['docker', 'exec', container, 'dropdb', '-U', 'postgres', database], check=True)
    report['passed'] = True
finally:
    subprocess.run(['docker', 'stop', '-t', '30', container], check=True, stdout=subprocess.DEVNULL)
    state = json.loads(subprocess.check_output(['docker', 'inspect', container]))[0]['State']
    report['containerExit'] = state['ExitCode']
    report['oomKilled'] = state['OOMKilled']
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (root / 'evidence/final-restore.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
