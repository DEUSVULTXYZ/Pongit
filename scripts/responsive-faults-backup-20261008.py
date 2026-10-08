"""Append-only backup after real browser faults and role reserve allocation."""
import pathlib, sys

helper = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-backup-20261008.py')
source = helper.read_text()
old = "assert backup_label in ['backup-preparation','backup-drained','backup-migrated']"
assert source.count(old) == 1
assert "pathlib.Path('/opt/pongit/releases/responsive-20261008-r2') / backup_label" in source
source = source.replace(old, "assert backup_label == 'backup-faults-7'")
sys.argv = [str(helper), 'backup-faults-7']
exec(compile(source, str(helper), 'exec'), {'__name__': '__main__'})
