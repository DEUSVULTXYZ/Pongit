"""Verify the off-VPS archive hash and every archived file without extracting."""
import datetime, hashlib, json, pathlib, sys, tarfile

root=pathlib.Path(sys.argv[1]); manifest_path=root/'manifest.json'
manifest=json.loads(manifest_path.read_text()); archive=root/'build-inputs.private.tar.gz'
def sha(stream):
    h=hashlib.sha256()
    for data in iter(lambda:stream.read(1048576),b''):h.update(data)
    return h.hexdigest()
with archive.open('rb') as f:assert sha(f)==manifest['archiveSha256']
assert archive.stat().st_size==manifest['archiveBytes']
seen=set()
with tarfile.open(archive,'r|gz') as tar:
    for member in tar:
        if member.isdir():continue
        name='/'+member.name; assert name in manifest['files'] and name not in seen
        expected=manifest['files'][name];seen.add(name)
        if 'link' in expected:assert member.issym() and member.linkname==expected['link']
        elif member.islnk():
            target='/'+member.linkname
            assert target in seen and target in manifest['files']
            assert manifest['files'][target]==expected
        else:
            assert member.isfile() and member.size==expected['bytes']
            with tar.extractfile(member) as f:assert sha(f)==expected['sha256']
assert seen==set(manifest['files'])
proof={'verified':True,'manifestSha256':hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
       'archiveSha256':manifest['archiveSha256'],'files':len(seen),'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(root/'off-vps.json').write_text(json.dumps(proof));print(json.dumps(proof))
