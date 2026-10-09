"""Reuse the exact guarded OCI export for five obsolete, unreferenced images."""
import ast,pathlib
helper=pathlib.Path(__file__).with_name('responsive-admission44-offload-images-20261009.py')
source=helper.read_text()
images={
 'pongit:reship-repeat-web-dependencies-sdk023':'sha256:b3d795aa0032e495074c1577df38e1e1938d9fac6182b94c7ab2537a2531d36f',
 'pongit:human-v3-web-850f040':'sha256:32b63d00080b8b53375cf8c804c4e1a6b9cbd73cbb93acb388fbeb38728d88a5',
 'pongit:public-sync-web-b60d1f9':'sha256:ee52f22c2422e81d5452f1dfb8bbab100b9e1c1dba92d1d674b8bd18e76ec27b',
 'pongit:public-sync-web-7a7f2b1':'sha256:2ab7dc26a41b3121531728a2f3a64f2f61896f7be1636b31e291d928a8516711',
 'pongit:sync-public-web-214c95a':'sha256:323203d00e010623aedb8214fd28a64c5af650402fa457b0d6905567839106cc',
}
assignment=next(n for n in ast.parse(source).body if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='images' for x in n.targets))
lines=source.splitlines(keepends=True)
source=''.join(lines[:assignment.lineno-1])+'images='+repr(images)+'\n'+''.join(lines[assignment.end_lineno:])
source=source.replace('admission44-image-offload','queue45-image-offload')
exec(compile(source,str(helper),'exec'),{'__name__':'__main__'})
