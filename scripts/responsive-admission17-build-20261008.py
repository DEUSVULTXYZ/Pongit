"""Build only the canonical-read grouping web change from its published commit."""
import pathlib
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/responsive-admission-build-20261008.py')
source=helper.read_text()
assert source.count('228c5b1955d75359cc3a6a034d3abb65c18b8f63')==1 and source.count('admission-source-228c5b1')==1
source=source.replace('228c5b1955d75359cc3a6a034d3abb65c18b8f63','791bef9c95e0233d25926de0ee653bdf17132dcd').replace('admission-source-228c5b1','admission-source-791bef9')
assert source.count("+'-16.json'")==1
source=source.replace("+'-16.json'","+'-17.json'")
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
