"""Replace only the web image at a backed-up seven-idle boundary."""
import pathlib
helper = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-admission17-cutover-20261008.py')
source = helper.read_text()
for before, after in {
    'admission-cutover-17.json': 'admission-cutover-36.json',
    'build-admission-web-17.json': 'build-admission-web-36.json',
    '791bef9c95e0233d25926de0ee653bdf17132dcd': 'e58531d9d434f9be544d0dfb39bc4a13d9bbdd5b',
    'backup-admission-16': 'backup-socket-36',
    'sha256:1e21ba11cc15832b7a2513843dae39bc0f623bcaca047dbf3322f55fb6048323': 'sha256:a109aebaa3420546bb2174656f1a119dcf4640ecd7b4040b5baed3374378f4a7',
    'admission-web-17.previous.private.json': 'admission-web-36.previous.private.json',
}.items():
    assert source.count(before) == 1
    source = source.replace(before, after)
exec(compile(source, str(helper), 'exec'), {'__name__': '__main__'})
