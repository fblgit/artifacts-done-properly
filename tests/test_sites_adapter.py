"""Sites call/receipt translation, not a hosted transport certification."""
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('sites_adapter', Path(__file__).resolve().parents[1] / 'skill/scripts/adp_sites_adapter.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class SitesAdapter(unittest.TestCase):
    def test_target_guard_and_readback(self):
        target = {'exists': True, 'data': {'old': 1}, 'revision': 7}
        call = adapter.write_call('fixture', 'content/intro', {'html': 'new'}, target)
        self.assertEqual(call['arguments']['expectedRevision'], 7)
        self.assertEqual(adapter.read_call('fixture', 'content/intro')['name'], 'adp_read')
        reply = {'content': [{'type': 'text', 'text': json.dumps({'revision': 8})}]}
        self.assertEqual(adapter.verify(call, reply, {'exists': True, 'data': {'html': 'new'}, 'revision': 8})['status'], 'verified')
        self.assertEqual(adapter.verify(call, reply, {'exists': True, 'data': {'html': 'other'}, 'revision': 9})['status'], 'conflict')

    def test_failure_and_unknown_are_not_success(self):
        call = adapter.write_call('fixture', 'content/intro', {}, {'exists': False, 'data': None, 'revision': 4})
        self.assertEqual(call['arguments']['expectedRevision'], 4)
        for reply in [None, {}, {'revision': True}]:
            self.assertEqual(adapter.verify(call, reply, None)['status'], 'unknown')
        error = {'isError': True, 'content': [{'type': 'text', 'text': '{"status":409,"error":"Revision conflict"}'}]}
        self.assertEqual(adapter.verify(call, error, None)['status'], 'conflict')
        with self.assertRaises(ValueError):
            adapter.write_call('fixture', 'content/intro', {}, {'exists': False, 'revision': True})
