from pathlib import Path
import json, os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_setup import Base


class ProjectFlagTests(Base):
    def setUp(self):
        super().setUp()
        self.other = os.path.join(self.tmp, 'other'); os.makedirs(self.other)
        self.x = os.path.join(self.tmp, 'myproj'); os.makedirs(self.x)

    def lines(self, d):
        p = os.path.join(d, '.adp', 'log.jsonl')
        return [json.loads(l) for l in Path(p).read_text().splitlines()] if os.path.isfile(p) else []

    def test_path_form_log_and_log_reads_it(self):
        self.assertEqual(self.run_adp('init', self.x).returncode, 0)
        self.assertEqual(self.run_adp('projects', '--project', self.x).returncode, 0)
        recs = self.lines(self.x)
        self.assertEqual(recs[-1]['cmd'], 'projects'); self.assertEqual(recs[-1]['args'], ['--project', self.x])
        r = self.run_adp('log', '--project', self.x, cwd=self.other)
        self.assertEqual(r.returncode, 0, r.stderr); self.assertIn('"cmd":"projects"', r.stdout)
        self.assertFalse(os.path.exists(os.path.join(self.other, '.adp')))

    def test_name_form(self):
        self.run_adp('init', self.x)
        self.run_adp('projects', '--project', 'myproj', cwd=self.other)
        self.assertEqual(self.lines(self.x)[-1]['args'], ['--project', 'myproj'])
        self.assertIn('"cmd":"projects"', self.run_adp('log', '--project', 'myproj', cwd=self.other).stdout)

    def test_unknown_name_and_missing_path(self):
        for bad in ('nope', os.path.join(self.tmp, 'gone')):
            r = self.run_adp('log', '--project', bad)
            self.assertEqual(r.returncode, 1)
            self.assertEqual(r.stderr.strip(), f'project not found: {bad} (adp.py projects lists them)')

    def test_no_adp_dir_uses_old_rule(self):
        self.run_adp('projects', '--project', self.x)
        self.assertFalse(os.path.exists(os.path.join(self.x, '.adp')))
        self.assertTrue(os.path.isfile(os.path.join(self.home, '.adp', 'log.jsonl')))

    def test_init_project(self):
        r = self.run_adp('init', '--project', self.x, cwd=self.other)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(os.path.isfile(os.path.join(self.x, '.adp', 'config.json')))
        self.assertFalse(os.path.exists(os.path.join(self.other, '.adp')))
        self.assertIn('myproj', self.run_adp('projects').stdout)

    def test_setup_project_registers_and_writes_under_x(self):
        r = self.run_adp('setup', '--scope', 'project', '--project', self.x, '--yes', cwd=self.other)
        self.assertEqual(r.returncode, 0, r.stderr)
        for f in ('.claude/skills/adp-new/SKILL.md', 'CLAUDE.md', '.gitignore', '.adp/config.json'):
            self.assertTrue(os.path.exists(os.path.join(self.x, f)), f)
        self.assertEqual(os.listdir(self.other), [])
        self.assertIn(self.x, self.run_adp('projects').stdout)

    def test_no_flag_unchanged(self):
        self.run_adp('init'); self.run_adp('projects')
        self.assertEqual(self.lines(self.cwd)[-1]['args'], [])
        self.assertIn('"cmd":"projects"', self.run_adp('log').stdout)

    def test_secrets_still_redacted(self):
        self.run_adp('init', self.x)
        self.run_adp('projects', '--project', self.x, '--api-key', 'hunter2')
        raw = Path(os.path.join(self.x, '.adp', 'log.jsonl')).read_text()
        self.assertNotIn('hunter2', raw); self.assertIn('***', raw)


if __name__ == '__main__':
    unittest.main()
