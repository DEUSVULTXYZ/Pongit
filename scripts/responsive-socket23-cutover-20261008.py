"""Reuse the bounded idle-only web deployment with exact candidate and backup."""
import pathlib
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-admission17-cutover-20261008.py')
source=helper.read_text()
replacements={
 'admission-cutover-17.json':'admission-cutover-23.json',
 'build-admission-web-17.json':'build-admission-web-23-resume1.json',
 '791bef9c95e0233d25926de0ee653bdf17132dcd':'a8ba7240cdf8cdc16c70708533e8c3d5e26afe55',
 'backup-admission-16':'backup-socket-23',
 'sha256:1e21ba11cc15832b7a2513843dae39bc0f623bcaca047dbf3322f55fb6048323':'sha256:e34276d7c424cea0fd4789dab99021fd90ee64fa6cf2365560673b8d4e6bbbdf',
 'admission-web-17.previous.private.json':'admission-web-23.previous.private.json',
}
for before,after in replacements.items():
 assert source.count(before)==1;source=source.replace(before,after)
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
