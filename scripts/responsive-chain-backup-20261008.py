"""Back up current state and exact gateway configuration before the read-path cutover."""
import pathlib,sys
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-backup-20261008.py')
source=helper.read_text()
old="assert backup_label in ['backup-preparation','backup-drained','backup-migrated']"
assert source.count(old)==1
assert "pathlib.Path('/opt/pongit/releases/responsive-20261008-r2') / backup_label" in source
source=source.replace(old,"assert backup_label == 'backup-chain-12'")
needle='paths = [p for p in paths if p.exists()]'
assert source.count(needle)==1
source=source.replace(needle,"paths += [pathlib.Path('/opt/pongit/current') / n for n in ['compose.yaml','compose.override.yaml','ops/Caddyfile']]\n"+needle)
needle="'pongit-relayer-1', 'pongit-arcade-five-arcade-web-1',"
assert source.count(needle)==1
source=source.replace(needle,"'pongit-rpc-1', "+needle)
sys.argv=[str(helper),'backup-chain-12']
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
