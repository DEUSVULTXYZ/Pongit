"""Preserve failed offline test 14; build and test corrected local signing separately."""
import pathlib
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-queue-build-20261008.py')
source=helper.read_text()
source=source.replace('6f5d238ba9d14b582152f23d4cbe9483b727609e','96bfe24d607286cade4753b530f6103ba3819734').replace('6f5d238','96bfe24')
source=source.replace('queue-14','queue-15')
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
