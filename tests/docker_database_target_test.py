import importlib.util, pathlib, unittest

path = pathlib.Path(__file__).resolve().parents[1] / 'scripts/docker_database_target.py'
spec = importlib.util.spec_from_file_location('target', path)
target = importlib.util.module_from_spec(spec)
spec.loader.exec_module(target)

def item(name, network, ip, running=True):
    return dict(Name='/'+name, State=dict(Running=running), NetworkSettings=dict(Networks={network: dict(IPAddress=ip, Aliases=['database'])}))

class TargetTests(unittest.TestCase):
    def test_other_project_same_alias_cannot_replace_current_database(self):
        values = [item('client', 'current', ''), item('current-db', 'current', '172.20.0.2'), item('old-db', 'old', '172.21.0.2')]
        self.assertEqual(target.database_target(values, 'client', 'database'), ('current-db', ['172.20.0.2']))
    def test_stopped_duplicate_is_not_a_live_endpoint(self):
        values = [item('client', 'current', ''), item('current-db', 'current', '172.20.0.2'), item('old-db', 'current', '', False)]
        self.assertEqual(target.database_target(values, 'client', 'database')[0], 'current-db')
    def test_ambiguous_and_missing_aliases_fail(self):
        values = [item('client', 'current', ''), item('a', 'current', '172.20.0.2'), item('b', 'current', '172.20.0.3')]
        with self.assertRaises(ValueError): target.database_target(values, 'client', 'database')
        with self.assertRaises(ValueError): target.database_target(values[:1], 'client', 'missing')

if __name__ == '__main__': unittest.main()
