"""Replace only the web image after the backed-up, seven-idle boundary."""
import pathlib
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-admission17-cutover-20261008.py')
source=helper.read_text()
for before,after in {
 'admission-cutover-17.json':'admission-cutover-27.json',
 'build-admission-web-17.json':'build-admission-web-27.json',
 '791bef9c95e0233d25926de0ee653bdf17132dcd':'14c0b29288dc7f4390d63233ab3dbb9b5aa008f4',
 'backup-admission-16':'backup-proposal-27',
 'sha256:1e21ba11cc15832b7a2513843dae39bc0f623bcaca047dbf3322f55fb6048323':'sha256:58786aab8808fae485c5d1726864e73612c1f106dcd66655d13a37a87feb2624',
 'admission-web-17.previous.private.json':'admission-web-27.previous.private.json',
}.items():
 assert source.count(before)==1;source=source.replace(before,after)
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
