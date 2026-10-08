"""Regression: exported source hashes alone cannot prove unchanged runtime."""
import copy
import importlib.util
import json
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[1] / 'scripts/responsive-runtime-observer-20261008.py'
spec = importlib.util.spec_from_file_location('observer', path)
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)


class RuntimeIdentityTests(unittest.TestCase):
    def setUp(self):
        self.row = dict(Id='a', Image='sha256:old', RestartCount=0, Mounts=[],
                        State=dict(StartedAt='before', Running=True, Paused=False, OOMKilled=False),
                        Config=dict(Env=['PASSWORD=do-not-save-this'], Cmd=['node', 'server']), HostConfig={})

    def test_environment_values_never_leave_identity(self):
        serialized = json.dumps(observer.identity(self.row))
        self.assertNotIn('PASSWORD', serialized)
        self.assertNotIn('do-not-save-this', serialized)

    def test_redeployment_restart_or_changed_permissions_invalidates(self):
        original = {'web': observer.identity(self.row)}
        for field, value in [('Image', 'sha256:new'), ('Id', 'b'), ('RestartCount', 1)]:
            with self.subTest(field=field):
                changed = copy.deepcopy(self.row)
                changed[field] = value
                self.assertEqual(observer.differences(original, {'web': observer.identity(changed)}), ['web'])
        changed = copy.deepcopy(self.row)
        changed['Config']['Env'] = ['PASSWORD=different']
        self.assertEqual(observer.differences(original, {'web': observer.identity(changed)}), ['web'])

    def test_runtime_only_changes_do_not_mutate_baseline(self):
        a = observer.identity(self.row)
        self.assertEqual(observer.differences({'web': a}, {'web': observer.identity(self.row)}), [])
        self.assertEqual(observer.differences({'web': a}, {}), ['web'])

    def test_restart_and_deployment_events_are_preserved_not_exec_noise(self):
        self.assertTrue({'start', 'die', 'restart', 'destroy', 'update'} <= observer.CHANGES)
        self.assertFalse({'exec_create', 'exec_start', 'exec_die'} & observer.CHANGES)


if __name__ == '__main__':
    unittest.main()
