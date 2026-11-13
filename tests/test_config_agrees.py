"""`adp.py config set`, `hold`, `config` and `requests` agree with adp.js and say what they do (docs/config.md sections 4 and 6)."""
import datetime
import json
import os
import re
import unittest

from test_commands import Cmd


class ConfigSetValues(Cmd):
    def refused(self, key, value):
        r = self.run_adp('config', 'set', key, value, '--out', self.p('o'))
        self.assertEqual(r.returncode, 1, r.stdout + r.stderr)
        self.assertEqual(len(r.stderr.strip().splitlines()), 1, r.stderr)
        self.assertNotIn('Traceback', r.stderr)
        self.assertFalse(os.path.exists(self.p('o')))

    def test_url_is_https_only(self):
        self.refused('links.board', 'http://example.com')
        self.assertEqual(self.ok('config', 'set', 'links.board', 'https://example.com', '--out', self.p('o'))['value'], 'https://example.com')
        self.ok('config', 'set', 'links.board', '', '--out', self.p('o2'))

    def test_datetime_is_a_real_date(self):
        for bad in ('2026-13-45', '2026-11-13T25:00', 'tomorrow'):
            self.refused('edit.until', bad)
        for good in ('2026-11-13', '2026-11-13T10:00', '2026-11-13 10:00:00', '2026-11-13T10:00:00Z', '2026-11-13T10:00:00.5+08:00', ''):
            self.ok('config', 'set', 'edit.until', good, '--out', self.p('o'))

    def test_text_is_at_most_2000(self):
        self.refused('edit.reason', 'x' * 2001)
        self.ok('config', 'set', 'edit.reason', 'x' * 2000, '--out', self.p('o'))

    def test_unknown_keys_stay_accepted(self):
        self.assertTrue(self.ok('config', 'set', 'assist.lanes', '["ask"]', '--out', self.p('o'))['unknown'])


class ConfigDefaultKeepsChanged(Cmd):
    def test_back_to_default_keeps_changed_and_drops_value(self):
        doc = self.write_json('c.json', {'values': {'edit.locked': True}, 'changed': {'edit.locked': {'by': 'old', 'at': 't'}}})
        out = self.ok('config', 'set', 'edit.locked', 'false', '--doc', doc, '--by', 'me', '--out', self.p('o'))
        cur = next(w for b in out['batches'] for w in b if w['collection'] == 'config')
        data = json.load(open(cur['file_path']))
        data = data.get('data', data)
        self.assertEqual(data['values'], {})
        self.assertEqual(data['changed']['edit.locked']['by'], 'me')


class HoldSays(Cmd):
    def test_usage_states_the_cap(self):
        r = self.run_adp('hold')
        self.assertIn('[--hours H (at most 2)]', r.stderr)

    def test_ten_hours_writes_two_and_says_so(self):
        out = self.ok('hold', self.p('d'), 'home', '--by', 'me', '--hours', '10', '--out', self.p('o'))
        got = datetime.datetime.strptime(out['hold_until'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc)
        want = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)
        self.assertLess(abs((want - got).total_seconds()), 30)
        part = next(w for b in out['batches'] for w in b if w['collection'] == 'parts')
        self.assertIn(out['hold_until'], open(part['file_path']).read())

    def test_refs_text_states_the_cap(self):
        ref = os.path.join(os.path.dirname(__file__), '..', 'skill', 'refs', 'adp-edit', 'SKILL.md')
        self.assertIn('[--hours H] (at most 2)', open(ref).read())


class ConfigDir(Cmd):
    def test_dir_is_optional_and_not_read(self):
        a, b, c = (self.ok('config', *x) for x in ((), ('nowhere',), (self.p('x'),)))
        self.assertEqual(a, b)
        self.assertEqual(a, c)
        self.assertIn('defaults', a)

    def test_usage_lines_say_so(self):
        src = open(self.adp).read()
        self.assertTrue(re.search(r'adp\.py config \[DIR\] \[--doc C\.json\].*DIR is accepted and not read', src))
        self.assertIn('ping-lane requests are listed on purpose', src)


if __name__ == '__main__':
    unittest.main()
