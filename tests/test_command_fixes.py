"""Regression tests for the six command bugs found by tests/test_commands.py: a missing or malformed input file, `gate` on non-JSON stdin,
`seed` flags on an existing seed, `seed` on a missing directory, a failed `requests` call leaving a directory, thin usage and flag parsing."""
import json
import os
import unittest

from test_commands import Cmd


class InputFiles(Cmd):
    """A file the person named that is missing or not JSON: one line on stderr, exit 1, no traceback."""

    def refused(self, *args, stdin=None, word):
        r = self.run_adp(*args, stdin=stdin)
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertNotIn('Traceback', r.stderr)
        self.assertIn(word, r.stderr)
        self.assertEqual(len(r.stderr.strip().splitlines()), 1, r.stderr)
        return r

    def test_record_missing_old(self):
        d = self.new_project()
        self.refused('record', 'nofile.json', d, '--seq', '2', '--summary', 'x', word='OLD.json')

    def test_requests_missing_and_malformed_dump(self):
        self.refused('requests', 'nofile.json', word='DUMP.json')
        open(self.p('bad.json'), 'w').write('not json')
        self.refused('requests', 'bad.json', word='is not JSON')

    def test_ack_missing_result(self):
        d = self.new_project()
        self.refused('ack', d, '--result', 'nofile.json', word='--result')

    def test_ack_non_json_stdin(self):
        d = self.new_project()
        self.refused('ack', d, stdin='notjson', word='not JSON')

    def test_gate_missing_input_file(self):
        self.refused('gate', '--input', 'nofile.json', word='--input')

    def test_pins_file_missing(self):
        d = self.new_project()
        self.refused('record', self.write_json('old.json', {'parts': {}}), d, '--seq', '2', '--summary', 'x', '--pins', 'nopins.json', word='--pins')


class GateStdin(Cmd):
    def test_non_json_stdin_allows_with_a_reason(self):
        r = self.run_adp('gate', stdin='notjson')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn('Traceback', r.stderr)
        out = json.loads(r.stdout)
        text = json.dumps(out)
        self.assertNotIn('deny', text)
        self.assertNotIn('permissionDecision', text)      # the same shape as every other allowed call
        self.assertIn('not JSON', text)


class SeedFlags(Cmd):
    def seed_of(self, d):
        with open(os.path.join(d, 'seed.json')) as f:
            return json.load(f)

    def test_by_and_version_win_on_an_existing_seed(self):
        d = self.new_project()
        self.assertEqual(self.seed_of(d)['by'], 'adp')
        out = self.ok('seed', d, '--by', 'tester', '--version', '7')
        self.assertTrue(out['written'])
        idx = self.seed_of(d)
        self.assertEqual((idx['by'], idx['version']), ('tester', '7'))
        # a rerun without flags keeps them, and nothing is rewritten
        out = self.ok('seed', d)
        self.assertFalse(out['written'])
        self.assertEqual(self.seed_of(d)['by'], 'tester')

    def test_other_commands_keep_the_seed_by(self):
        d = self.new_project()
        self.ok('seed', d, '--by', 'tester')
        self.ok('files', d)                       # re-seeds with defaults after edits; must not reset by
        self.assertEqual(self.seed_of(d)['by'], 'tester')

    def test_missing_directory_is_refused_and_not_created(self):
        r = self.run_adp('seed', 'nonexist')
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn('not a directory', r.stderr)
        self.assertFalse(os.path.exists(self.p('nonexist')))

    def test_dry_run_before_the_directory(self):
        d = self.new_project()
        out = self.ok('seed', '--dry-run', d)
        self.assertIn('docs', out)


class RequestsLeavesNothing(Cmd):
    def dump(self):
        return self.write_json('dump.json', [{'id': 'r1', 'data': {'lane': 'change', 'text': 't', 'at': '2026-01-01T00:00:00Z'}, 'version': 1}])

    def test_refused_call_makes_no_out_directory(self):
        dump = self.dump()
        r = self.run_adp('requests', dump, '--progress', 'r1', '--out', 'o')
        self.assertEqual(r.returncode, 1)
        self.assertIn('--progress needs --text', r.stderr)
        self.assertFalse(os.path.exists(self.p('o')))

    def test_a_good_call_still_writes_its_docs(self):
        dump = self.dump()
        out = self.ok('requests', dump, '--progress', 'r1', '--text', 'on it', '--out', 'o')
        self.assertTrue(os.path.isdir(self.p('o')))
        self.assertTrue(all(os.path.isfile(w['file_path']) for b in out['batches'] for w in b if 'file_path' in w))

    def test_usage_names_every_option(self):
        r = self.run_adp('requests')
        for flag in ('--pins', '--turns', '--by', '--out', '--changed', '--version'):
            self.assertIn(flag, r.stderr)


class Usage(Cmd):
    def test_propose_usage_says_every_deleted_part_needs_its_pair(self):
        r = self.run_adp('propose')
        self.assertIn('every deleted part id needs its own --retire ID --reason R pair', r.stderr)


if __name__ == '__main__':
    unittest.main()
