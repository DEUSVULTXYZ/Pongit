"""Reuse the verified archive/off-VPS/mount guards for two completed web builds."""
import pathlib
helper=pathlib.Path('/opt/pongit/releases/responsive-20261008-r2/offload-responsive-contexts-recovered-20261008.py')
source=helper.read_text()
old="names=['build-source','touch-build-c0e687f','feedback-build-05d7711','motion-build-5486a5f']"
assert source.count(old)==1 and source.count("out=root/'offload-contexts-10'")==1
source=source.replace(old,"names=['admission-source-791bef9-build','admission-source-228c5b1-build']")
source=source.replace("out=root/'offload-contexts-10'","out=root/'offload-contexts-22'")
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
