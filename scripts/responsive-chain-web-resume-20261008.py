"""Resume the unstarted web phase; never repeat the completed runtime build."""
import datetime, hashlib, json, os, pathlib, shutil, subprocess
root=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
commit='132a51b'; context=root/'chain-build-132a51b'
runtime=json.loads((root/'build-chain-runtime-12.json').read_text())
assert runtime['passed'] and runtime['source']==commit
assert runtime['image']=='sha256:7c128465991558adbe8678bfce5f7a3fbc99b8edcccaebcf07c52f99eb2331d7'
assert context.is_dir() and not (root/'build-chain-web-12.json').exists()
source=(root/'responsive-chain-build-20261008.py').read_text()
helpers=source[source.index('def disk():'):source.index("base='sha256:")]
exec(compile(helpers,'reviewed-build-functions','exec'))
build('web','Dockerfile.web',['--target','web','--build-arg','NEXT_PUBLIC_API_URL=https://pongit.xyz/api',
 '--build-arg','NEXT_PUBLIC_WS_URL=wss://pongit.xyz/ws','--build-arg','NEXT_PUBLIC_RP_ID=pongit.xyz','--build-arg','PONG_REQUIRE_AGENT_POOL_MANIFEST=true'],'1800m')
