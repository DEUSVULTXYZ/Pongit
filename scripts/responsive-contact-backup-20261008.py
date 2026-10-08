"""A fresh append-only backup before the web correction, using the reviewed R2 helper."""
import pathlib, sys

helper = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-backup-20261008.py')
source = helper.read_text()
old = "assert backup_label in ['backup-preparation','backup-drained','backup-migrated']"
assert source.count(old) == 1
assert "pathlib.Path('/opt/pongit/releases/responsive-20261008-r2') / backup_label" in source
source = source.replace(old, "assert backup_label == 'backup-contact-2'")
sys.argv = [str(helper), 'backup-contact-2']
exec(compile(source, str(helper), 'exec'), {'__name__': '__main__'})
