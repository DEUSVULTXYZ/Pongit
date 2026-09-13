"""Reindex in a disposable private database, preserving the current production indexer."""
from pathlib import Path
import json,secrets,subprocess,shutil
base=Path('/opt/pongit/tests/drand-20260913')
root=base/'indexer-shadow'
root.mkdir(exist_ok=True)
src=base/'indexer-fixture/indexer'
for name in ['package.json','package-lock.json','schema.graphql','tsconfig.json','config.template.yaml']:
 shutil.copy2(src/name,root/name)
shutil.copytree(src/'src',root/'src',dirs_exist_ok=True)
config=subprocess.check_output(['docker','exec','pongit-indexer-1','cat','config.yaml'],text=True)
# Preserve all existing chain bindings and retain the established private RPC.
contracts=config.split('\nchains:')[1]
prefix=(root/'config.template.yaml').read_text().split('\nchains:')[0]
m=json.loads((base/'verification/artifacts/drand/production-manifests.json').read_text())['finance']
assert m['adapter']=='0xd7602b6ae87798e0f39ea25b97f75dcc5dd0822f'
config=prefix+'\nchains:'+contracts.rstrip()+f'\n      - name: ChaosEventsArchive\n        address: "{m["adapter"]}"\n        start_block: {m["startBlock"]}\n'
(root/'config.yaml').write_text(config)
p=Path('/opt/pongit/secrets/rooms/chaos-indexer-shadow.env')
if not p.exists():
 token=secrets.token_hex(24)
 p.write_text('\n'.join(['ENVIO_PG_HOST=pongit-chaos-history','ENVIO_PG_PORT=5432','ENVIO_PG_USER=chaos','ENVIO_PG_PASSWORD=','ENVIO_PG_DATABASE=chaos_shadow','ENVIO_PG_SCHEMA=indexer','HASURA_GRAPHQL_ENDPOINT=http://chaos-shadow-hasura:8080/v1/metadata','HASURA_GRAPHQL_ADMIN_SECRET='+token,'HASURA_GRAPHQL_DATABASE_URL=postgresql://chaos@pongit-chaos-history:5432/chaos_shadow','HASURA_GRAPHQL_ENABLE_CONSOLE=false'])+'\n');p.chmod(0o600)
print('Isolated full-history indexer configured with the additional events archive.')
