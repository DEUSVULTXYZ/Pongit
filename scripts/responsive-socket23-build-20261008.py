"""Build the exact published socket recovery web candidate."""
import pathlib
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-admission-build-20261008.py')
source=helper.read_text()
assert source.count('228c5b1955d75359cc3a6a034d3abb65c18b8f63')==1 and source.count('admission-source-228c5b1')==1
source=source.replace('228c5b1955d75359cc3a6a034d3abb65c18b8f63','a8ba7240cdf8cdc16c70708533e8c3d5e26afe55').replace('admission-source-228c5b1','socket-source-a8ba724')
assert source.count("+'-16.json'")==1
source=source.replace("+'-16.json'","+'-23.json'")
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
