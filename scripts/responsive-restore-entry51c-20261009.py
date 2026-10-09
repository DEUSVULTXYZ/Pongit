"""Restore the verified Windows copy, isolated from all production networks."""
import datetime, hashlib, json, pathlib, subprocess, time

repo = pathlib.Path(__file__).resolve().parents[1]
inputs = pathlib.Path('C:/Users/wwwle/.codex/private-backups/pongit/responsive-20261008-r2/backup-entry-51b')
manifest = json.loads((inputs / 'manifest.json').read_text())
output = repo / 'artifacts/responsive-20261008-r2/restore-entry51c.json'
assert not output.exists()
assert set(manifest) == {'operator.dump', 'human.dump', 'agents.dump', 'previous-agents.dump', 'shared-index.dump', 'configuration.private.tar.gz'}
for name, entry in manifest.items():
    with (inputs / name).open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == entry['sha256']
    assert (inputs / name).stat().st_size == entry['bytes']
name = 'pongit-entry51c-offvps-restore'
assert subprocess.run(['docker', 'inspect', name], capture_output=True).returncode != 0
assert subprocess.run(['docker', 'volume', 'inspect', 'pongit-entry51c-restore-data'], capture_output=True).returncode != 0
image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', 'postgres:17-alpine']))[0]['Id']
proof = json.loads((repo / 'artifacts/responsive-20261008-r2/entry50-groups-proof.json').read_text())
assert proof['passed'] and proof['groups']
report = dict(startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), passed=False,
              scope='Actual off-VPS restore into isolated local PostgreSQL; no production writes', image=image,
              manifestSha256=hashlib.sha256((inputs / 'manifest.json').read_bytes()).hexdigest(), databases=[])
save = lambda: output.write_text(json.dumps(report, indent=2))
save()
subprocess.run(['docker', 'run', '-d', '--name', name, '--network', 'none', '--memory', '512m', '--cpus', '0.5',
                '--mount', 'type=volume,source=pongit-entry51c-restore-data,target=/var/lib/postgresql/data',
                '-e', 'POSTGRES_USER=pongit_restore', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image, '-c', 'shared_buffers=32MB', '-c', 'maintenance_work_mem=32MB', '-c', 'max_wal_size=128MB'],
               check=True, capture_output=True)

def sql(database, query):
    result = subprocess.run(['docker', 'exec', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'pongit_restore',
                             '-d', database, '-Atc', query], capture_output=True, text=True, timeout=45)
    assert result.returncode == 0, 'Restore verification query failed'
    return result.stdout.strip()

try:
    for attempt in range(60):
        if subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'pongit_restore'], capture_output=True).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Isolated PostgreSQL readiness failed')
    for i, label in enumerate(['operator', 'human', 'agents', 'previous-agents', 'shared-index']):
        database = 'entry51c_scratch_' + str(i)
        subprocess.run(['docker', 'exec', name, 'createdb', '-U', 'pongit_restore', database], check=True, capture_output=True)
        with (inputs / (label + '.dump')).open('rb') as stream:
            restored = subprocess.run(['docker', 'exec', '-i', name, 'pg_restore', '-U', 'pongit_restore', '-d', database,
                                       '--no-owner', '--no-privileges', '--exit-on-error'], stdin=stream, capture_output=True, timeout=600)
        if restored.returncode != 0:
            report['failedDatabase'] = label
            report['restoreExit'] = restored.returncode
            save()
            raise RuntimeError('Restore failed for ' + label)
        row = dict(label=label, tables=int(sql(database, "SELECT count(*) FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')")))
        assert row['tables'] > 0
        if label == 'operator':
            for group in proof['groups']:
                assert group['hash'].startswith('0x') and len(group['hash']) == 66
                observed = sql(database, "SELECT count(*) FROM il_lifecycle_jobs WHERE status='confirmed' AND hash='" + group['hash'] + "' AND nonce=" + str(int(group['nonce'])))
                assert int(observed) == 1, 'Canonical grouped transaction journal lost'
            row['canonicalGroups'] = len(proof['groups'])
        if label == 'agents':
            row['groups'] = int(sql(database, 'SELECT count(*) FROM independent_operation_batches'))
            assert row['groups'] >= len(proof['groups'])
            row['invalidMembers'] = int(sql(database, "SELECT count(*) FROM independent_operation_batches b CROSS JOIN LATERAL unnest(b.members) m(id) LEFT JOIN independent_operations o ON o.id=m.id WHERE o.id IS NULL"))
            assert row['invalidMembers'] == 0
            for group in proof['groups']:
                assert int(sql(database, "SELECT count(*) FROM independent_operations WHERE status='confirmed' AND hash='" + group['hash'] + "'")) == group['members']
        archives = [table for table in ['il_reusable_results', 'il_reusable_slot_results'] if sql(database, "SELECT to_regclass('public." + table + "') IS NOT NULL") == 't']
        row['archiveRows'] = {table: int(sql(database, 'SELECT count(*) FROM ' + table)) for table in archives}
        report['databases'].append(row)
        save()
        # Only this verified scratch database is dropped; the input is retained.
        subprocess.run(['docker', 'exec', name, 'dropdb', '-U', 'pongit_restore', database], check=True, capture_output=True)
    report['passed'] = True
finally:
    subprocess.run(['docker', 'stop', '--time', '30', name], check=True, capture_output=True)
    state=json.loads(subprocess.check_output(['docker','inspect',name]))[0]['State']
    report['container'] = dict(name=name, exitCode=state['ExitCode'], oomKilled=state['OOMKilled'], dataVolume='pongit-entry51c-restore-data')
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save()
    print(json.dumps(report))
