"""Resume only the unstarted build after scoped cleanup; retain first failure."""
import ast,datetime,hashlib,json,os,pathlib,shutil,subprocess,tarfile
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
first=json.loads((root/'build-admission-web-23.json').read_text())
assert first['source']=='a8ba7240cdf8cdc16c70708533e8c3d5e26afe55' and not first['passed'] and 'image' not in first
assert not (root/'build-admission-web-23.log').exists()
context=root/'socket-source-a8ba724-build';assert context.is_dir()
archive=root/'socket-source-a8ba724.tar.gz'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==first['archiveSha256']
helper=root/'responsive-admission-build-20261008.py'
source=helper.read_text();assert source.count("+'-16.json'")==1
source=source.replace("+'-16.json'","+'-23-resume1.json'")
tree=ast.parse(source)
functions=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[])
exec(compile(functions,str(helper),'exec'))
build('web',context,first['archiveSha256'],first['source'],'1800m',['-f','Dockerfile.web','--target','web','--build-arg','NEXT_PUBLIC_API_URL=https://pongit.xyz/api','--build-arg','NEXT_PUBLIC_WS_URL=wss://pongit.xyz/ws','--build-arg','NEXT_PUBLIC_RP_ID=pongit.xyz','--build-arg','PONG_REQUIRE_AGENT_POOL_MANIFEST=true'])
