"""Reuse bounded idle-only cutover with pinned current roles and fresh backup."""
import pathlib
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-queue-cutover-20261008.py')
source=helper.read_text()
changes={
 'queue-cutover-15.json':'admission-cutover-18.json',
 'build-queue-15.json':'build-admission-18.json',
 '96bfe24d607286cade4753b530f6103ba3819734':'28d32cbef0101ec870d20c9ac2c73bd01a0c3604',
 'backup-queue-14':'backup-admission-18',
 'sha256:7c128465991558adbe8678bfce5f7a3fbc99b8edcccaebcf07c52f99eb2331d7':'sha256:067d468b1ea2640657b6c03b972f776aae3d28342240e1788e163ac85c67abab',
 'sha256:9414d534bc5930795a8b64e707d3e30e25d7fd330a33f285ac9e2dfeb2ae21fa':'sha256:51111873f07c5230375c1fe7adf06ca398953eaed9d06bd881de0ee8758f30c4',
 'queue-agent-15.previous.private.json':'admission-agent-18.previous.private.json',
 'queue-rpc-15.previous.private.yaml':'admission-rpc-18.previous.private.yaml',
}
for old,new in changes.items():
 assert source.count(old)==1,(old,source.count(old))
 source=source.replace(old,new)
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
