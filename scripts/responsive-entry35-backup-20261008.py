"""Fresh state/runtime backup before the compatible HTTP recovery web cutover."""
import pathlib
helper = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-chain-backup-20261008.py')
source = helper.read_text()
assert source.count('backup-chain-12') == 2
exec(compile(source.replace('backup-chain-12', 'backup-entry-35'), str(helper), 'exec'), {'__name__': '__main__'})
