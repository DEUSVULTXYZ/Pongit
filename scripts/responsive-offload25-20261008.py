"""Offload four completed compiler contexts after per-file off-VPS verification."""
import pathlib
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/offload-responsive-contexts-recovered-20261008.py')
s=helper.read_text();old="names=['build-source','touch-build-c0e687f','feedback-build-05d7711','motion-build-5486a5f']"
assert s.count(old)==1 and s.count("out=root/'offload-contexts-10'")==1
s=s.replace(old,"names=['chain-build-132a51b','socket-source-a8ba724-build','fix24-source-ce7968f-build','gateway24-build-ce7968f']").replace("out=root/'offload-contexts-10'","out=root/'offload-contexts-25'")
exec(compile(s,str(helper),'exec'),{'__name__':'__main__'})
