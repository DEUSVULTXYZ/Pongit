"""Replace only the web image at a backed-up seven-idle boundary."""
import pathlib
helper = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-admission17-cutover-20261008.py')
source = helper.read_text()
for before, after in {
    'admission-cutover-17.json': 'admission-cutover-35.json',
    'build-admission-web-17.json': 'build-admission-web-35.json',
    '791bef9c95e0233d25926de0ee653bdf17132dcd': '5a524b7f4ec48ca97b92e8805cabb882c5ebf6ab',
    'backup-admission-16': 'backup-entry-35',
    'sha256:1e21ba11cc15832b7a2513843dae39bc0f623bcaca047dbf3322f55fb6048323': 'sha256:593816cc70bcbd70af91adfdb1503fd81b89b6ec893b292cf7ac5eafee13f086',
    'admission-web-17.previous.private.json': 'admission-web-35.previous.private.json',
}.items():
    assert source.count(before) == 1
    source = source.replace(before, after)
exec(compile(source, str(helper), 'exec'), {'__name__': '__main__'})
