"""Complete backup using database endpoints scoped to each actual client."""
import pathlib, sys

root = pathlib.Path('/opt/pongit/releases/responsive-20261008-r2')
helper = root / 'responsive-backup-20261008.py'
source = helper.read_text()
old = "assert backup_label in ['backup-preparation','backup-drained','backup-migrated']"
assert source.count(old) == 1
source = source.replace(old, "assert backup_label == 'backup-entry-61'")
old = "    databases.append((label, aliases[parsed.hostname], urllib.parse.unquote(parsed.username), parsed.path.lstrip('/')))"
assert source.count(old) == 1
source = source.replace(old, '''    from docker_database_target import database_target
    client = {'human':'pongit-relayer-1','operator':'pongit-relayer-1','agents':'pongit-arcade-five-sponsor-1','previous-agents':'pongit-agent-public-keeper'}[label]
    target, addresses = database_target(containers, client, parsed.hostname)
    if named[client]['State']['Running']:
        # DNS resolution from the actual consumer must agree with the network inventory.
        check = "import {lookup} from 'node:dns/promises';console.log(JSON.stringify((await lookup("+json.dumps(parsed.hostname)+",{all:true})).map(x=>x.address)));"
        observed = json.loads(subprocess.check_output(['docker','exec',client,'node','--input-type=module','-e',check],text=True))
        assert observed and set(observed).issubset(set(addresses)), 'Actual client resolves another database'
    databases.append((label, target, urllib.parse.unquote(parsed.username), parsed.path.lstrip('/')))''')
source = source.replace("'pongit-relayer-1', 'pongit-arcade-five-arcade-web-1',", "'pongit-rpc-1', 'pongit-relayer-1', 'pongit-arcade-five-arcade-web-1',")
source = source.replace('paths = [p for p in paths if p.exists()]', "paths += [pathlib.Path('/opt/pongit/current') / n for n in ['compose.yaml','compose.override.yaml','ops/Caddyfile']]\npaths = [p for p in paths if p.exists()]")
source = source.replace("'files': len(manifest)", "'databaseTargets': [{'label':v[0],'container':v[1],'database':v[3]} for v in databases], 'files': len(manifest)")
sys.argv = [str(helper), 'backup-entry-61']
exec(compile(source, str(helper), 'exec'), {'__name__': '__main__'})
