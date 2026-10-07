"""Offload obsolete, unmounted PONGIT build inputs; keep every evidence directory."""
import datetime, hashlib, json, pathlib, shutil, subprocess, sys, tarfile

roots = [pathlib.Path('/opt/pongit/tests/arcade-release-20260919'), pathlib.Path('/opt/pongit/tests/fluid-20260928')]
out = pathlib.Path('/opt/pongit/backups/unused-build-sources-20261007')
allowed = {'web', 'shared', 'tests', 'contracts', 'agent-sdk', 'indexer', 'assets', 'artwork', 'docs', 'relayer', 'scripts'}
def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda: f.read(1048576), b''): h.update(b)
    return h.hexdigest()
def mounts():
    ids = subprocess.check_output(['docker', 'ps', '-aq'], text=True).split()
    return [pathlib.Path(m['Source']).resolve() for c in json.loads(subprocess.check_output(['docker', 'inspect', *ids])) for m in c['Mounts'] if m.get('Source')]
def safe(p, mounted):
    p = p.resolve()
    return p.name in allowed and p.parent.parent in roots and not any(p == m or p in m.parents or m in p.parents for m in mounted)

if sys.argv[1] == 'archive':
    assert not out.exists(); out.mkdir(mode=0o700)
    mounted = mounts(); targets = []
    for root in roots:
        for source in root.iterdir():
            if not source.is_dir() or not (source / 'package.json').is_file(): continue
            if any(source.resolve() == m or source.resolve() in m.parents or m in source.resolve().parents for m in mounted): continue
            for name in sorted(allowed):
                p = source / name
                if p.is_dir() and not p.is_symlink() and safe(p, mounted): targets.append(p)
    manifest = {'targets': [str(p) for p in targets], 'files': {}}
    for p in targets:
        for f in p.rglob('*'):
            assert not f.is_symlink(), 'Preserve symlinked trees for separate review'
            if f.is_file(): manifest['files'][str(f)] = {'sha256': digest(f), 'bytes': f.stat().st_size}
    archive = out / 'build-inputs.private.tar.gz'
    with tarfile.open(archive, 'w:gz', compresslevel=1) as tar:
        for p in targets: tar.add(p, arcname=str(p).lstrip('/'))
    manifest['archiveSha256'] = digest(archive)
    manifest['archiveBytes'] = archive.stat().st_size
    (out / 'manifest.json').write_text(json.dumps(manifest))
    print(json.dumps({'archiveBytes':manifest['archiveBytes'], 'sha256':manifest['archiveSha256'], 'sourceBytes':sum(x['bytes'] for x in manifest['files'].values()), 'files':len(manifest['files'])}), flush=True)
elif sys.argv[1] == 'remove':
    manifest = json.loads((out / 'manifest.json').read_text()); proof = json.loads((out / 'off-vps.json').read_text())
    assert proof['verified'] and proof['archiveSha256'] == manifest['archiveSha256'] and proof['manifestSha256'] == digest(out / 'manifest.json')
    assert digest(out / 'build-inputs.private.tar.gz') == manifest['archiveSha256']
    mounted = mounts()
    for s in manifest['targets']: assert safe(pathlib.Path(s), mounted)
    for s, v in manifest['files'].items(): assert digest(pathlib.Path(s)) == v['sha256']
    # Evidence, diagnostics, logs, package manifests and all runtime directories
    # remain on the VPS. Only these verified source subdirectories are removed.
    for s in manifest['targets']: shutil.rmtree(pathlib.Path(s))
    (out / 'removed.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'targets':manifest['targets'], 'offVps':proof}))
    print(json.dumps({'removedBuildInputs':len(manifest['targets']), 'preservedOffVps':True}))
else: raise ValueError('Unknown action')
