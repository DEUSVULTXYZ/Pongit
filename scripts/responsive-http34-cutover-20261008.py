"""Replace only the web image at a backed-up seven-idle boundary."""
import pathlib
helper = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-admission17-cutover-20261008.py')
source = helper.read_text()
for before, after in {
    'admission-cutover-17.json': 'admission-cutover-34.json',
    'build-admission-web-17.json': 'build-admission-web-34.json',
    '791bef9c95e0233d25926de0ee653bdf17132dcd': '25548ad775f4f33f69a2ce47fe77169deee1c9d3',
    'backup-admission-16': 'backup-http-34',
    'sha256:1e21ba11cc15832b7a2513843dae39bc0f623bcaca047dbf3322f55fb6048323': 'sha256:f308911dff8799c9724fe6b2bb61af8b96d46a2d3db6b723396dd356055c7a61',
    'admission-web-17.previous.private.json': 'admission-web-34.previous.private.json',
}.items():
    assert source.count(before) == 1
    source = source.replace(before, after)
exec(compile(source, str(helper), 'exec'), {'__name__': '__main__'})
