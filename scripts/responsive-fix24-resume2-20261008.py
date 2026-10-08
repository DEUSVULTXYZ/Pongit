"""Resume only the unstarted build after scoped cleanup; retain first failure."""
import ast,datetime,hashlib,json,os,pathlib,shutil,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
first=json.loads((root/'build-admission-web-24.json').read_text())
assert first['source']=='ce7968fead3fa1f62816d24b2b1a1e10a40c554d' and not first['passed'] and 'image' not in first
assert not (root/'build-admission-web-24.log').exists()
context=root/'fix24-source-ce7968f-build';assert context.is_dir()
archive=root/'fix24-source-ce7968f.tar.gz'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==first['archiveSha256']
helper=root/'responsive-admission-build-20261008.py'
source=helper.read_text();assert source.count("+'-16.json'")==1
source=source.replace("+'-16.json'","+'-24-resume2.json'")
tree=ast.parse(source)
functions=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[])
exec(compile(functions,str(helper),'exec'))
build('web',context,first['archiveSha256'],first['source'],'1800m',['-f','Dockerfile.web','--target','web','--build-arg','NEXT_PUBLIC_API_URL=https://pongit.xyz/api','--build-arg','NEXT_PUBLIC_WS_URL=wss://pongit.xyz/ws','--build-arg','NEXT_PUBLIC_RP_ID=pongit.xyz','--build-arg','PONG_REQUIRE_AGENT_POOL_MANIFEST=true'])
