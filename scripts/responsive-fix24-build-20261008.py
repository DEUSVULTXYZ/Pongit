"""Build the exact published confirmed-contact candidate."""
import pathlib
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-admission-build-20261008.py')
source=helper.read_text()
assert source.count('228c5b1955d75359cc3a6a034d3abb65c18b8f63')==1
source=source.replace('228c5b1955d75359cc3a6a034d3abb65c18b8f63','ce7968fead3fa1f62816d24b2b1a1e10a40c554d').replace('admission-source-228c5b1','fix24-source-ce7968f')
assert source.count("+'-16.json'")==1
source=source.replace("+'-16.json'","+'-24.json'")
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
