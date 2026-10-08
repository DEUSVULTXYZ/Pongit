"""Fresh five-database/config backup before compatible RPC/human service release."""
import pathlib
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-chain-backup-20261008.py')
source=helper.read_text();assert source.count('backup-chain-12')==2
source=source.replace('backup-chain-12','backup-fair-26')
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
