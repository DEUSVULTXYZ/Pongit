"""Offload obsolete, unmounted PONGIT build inputs; keep every evidence directory."""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, sys, tarfile

roots = [pathlib.Path('/opt/pongit/tests') / name for name in ['agents-20260918-3','agents-20260918-2','agents-20260918','human-rules8-20260919','sync-20260929','catalog-recovery-20260929','agents-20260918-4','drand-20260913']]
roots += [pathlib.Path('/opt/pongit/releases') / name for name in ['fluid-input-03fc112','fluid-input-58fee17','fluid-input-01ba01c','controls-access-bcde17d','controls-access-77082f2','controls-access-c63f7c7','controls-access-693eca8','controls-access-1c56d73']]
out = pathlib.Path('/opt/pongit/backups/unused-build-sources-20261008-1')
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
            try:
                if not source.is_dir() or not (source / 'package.json').is_file(): continue
            except PermissionError:
                continue  # Database restore inputs are not build sources.
            if any(source.resolve() == m or source.resolve() in m.parents or m in source.resolve().parents for m in mounted): continue
            for name in sorted(allowed):
                p = source / name
                if p.is_dir() and not p.is_symlink() and safe(p, mounted): targets.append(p)
    manifest = {'targets': [str(p) for p in targets], 'files': {}}
    for p in targets:
        for f in p.rglob('*'):
            if f.is_symlink(): manifest['files'][str(f)] = {'link':os.readlink(f), 'bytes':0}
            elif f.is_file(): manifest['files'][str(f)] = {'sha256': digest(f), 'bytes': f.stat().st_size}
    archive = out / 'build-inputs.private.tar.gz'
    with tarfile.open(archive, 'w:gz', compresslevel=1) as tar:
        for p in targets: tar.add(p, arcname=str(p).lstrip('/'))
    manifest['archiveSha256'] = digest(archive)
    manifest['archiveBytes'] = archive.stat().st_size
    (out / 'manifest.json').write_text(json.dumps(manifest))
    print(json.dumps({'archiveBytes':manifest['archiveBytes'], 'sha256':manifest['archiveSha256'], 'sourceBytes':sum(x['bytes'] for x in manifest['files'].values()), 'files':len(manifest['files'])}), flush=True)
elif sys.argv[1] in ['remove', 'resume-remove']:
    manifest = json.loads((out / 'manifest.json').read_text()); proof = json.loads((out / 'off-vps.json').read_text())
    assert proof['verified'] and proof['archiveSha256'] == manifest['archiveSha256'] and proof['manifestSha256'] == digest(out / 'manifest.json')
    assert digest(out / 'build-inputs.private.tar.gz') == manifest['archiveSha256']
    mounted = mounts()
    for s in manifest['targets']: assert safe(pathlib.Path(s), mounted)
    resuming=sys.argv[1]=='resume-remove'
    if resuming: assert (out/'partial-removal-failure.json').is_file()
    for s, v in manifest['files'].items():
        p=pathlib.Path(s)
        if resuming and not p.exists() and not p.is_symlink(): continue
        if 'link' in v: assert p.is_symlink() and os.readlink(p)==v['link']
        else: assert digest(p) == v['sha256']
    for s in manifest['targets']:
        for p in pathlib.Path(s).rglob('*'):
            if p.is_file() or p.is_symlink(): assert str(p) in manifest['files'],'Unexpected new build input'
    # Evidence, diagnostics, logs, package manifests and all runtime directories
    # remain on the VPS. Only these verified source subdirectories are removed.
    removed=[];blocked=[]
    for s in manifest['targets']:
        try:
            if pathlib.Path(s).exists(): shutil.rmtree(pathlib.Path(s))
            removed.append(s)
        except PermissionError: blocked.append(s)
    (out / 'removed.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'targets':removed, 'retainedPermissionBlocked':blocked, 'offVps':proof}))
    print(json.dumps({'removedBuildInputs':len(removed), 'retainedPermissionBlocked':len(blocked), 'preservedOffVps':True}))
else: raise ValueError('Unknown action')
