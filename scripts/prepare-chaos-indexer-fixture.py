"""Prepare only the private indexer config and random, test-only Hasura secret."""
from pathlib import Path
import secrets
root=Path('/opt/pongit/tests/drand-20260913/indexer-fixture/indexer')
config=(root/'config.template.yaml').read_text().split('\nchains:')[0]
config+='''
chains:
  - id: 10143
    start_block: 62250000
    rpc:
      url: https://testnet-rpc.monad.xyz
      for: sync
      initial_block_interval: 99
      interval_ceiling: 99
      polling_interval: 1500
      query_timeout_millis: 120000
    contracts:
      - name: ChaosEventsArchive
        address: "0xf872ef6f2dbe57e13cd4137912ed10576a03b7c9"
        start_block: 62250000
'''
(root/'config.yaml').write_text(config)
p=Path('/opt/pongit/secrets/rooms/chaos-indexer.env')
if not p.exists():
 token=secrets.token_hex(24)
 p.write_text('\n'.join(['ENVIO_PG_HOST=pongit-chaos-history','ENVIO_PG_PORT=5432','ENVIO_PG_USER=chaos','ENVIO_PG_PASSWORD=', 'ENVIO_PG_DATABASE=chaos_indexer','ENVIO_PG_SCHEMA=indexer','HASURA_GRAPHQL_ENDPOINT=http://chaos-hasura:8080/v1/metadata','HASURA_GRAPHQL_ADMIN_SECRET='+token,'HASURA_GRAPHQL_DATABASE_URL=postgresql://chaos@pongit-chaos-history:5432/chaos_indexer','HASURA_GRAPHQL_ENABLE_CONSOLE=false','TEST_HASURA_SECRET='+token,'TEST_GRAPHQL_URL=http://chaos-hasura:8080/v1/graphql'])+'\n')
 p.chmod(0o600)
print('Isolated archive indexer prepared; secrets kept outside the source tree.')
