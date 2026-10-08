"""Build the exact published proposal-delivery web candidate."""
import pathlib
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-admission-build-20261008.py')
source=helper.read_text()
for before,after in {
 '228c5b1955d75359cc3a6a034d3abb65c18b8f63':'14c0b29288dc7f4390d63233ab3dbb9b5aa008f4',
 'admission-source-228c5b1':'proposal27-source-14c0b29',
 "+'-16.json'":"+'-27.json'",
}.items():
 assert source.count(before)==1;source=source.replace(before,after)
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
