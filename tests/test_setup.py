import json, os, shutil, subprocess, sys, tempfile, unittest

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'skill', 'scripts')


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.home, self.cwd = os.path.join(self.tmp, 'home'), os.path.join(self.tmp, 'proj')
        os.makedirs(self.home); os.makedirs(self.cwd)
        # a fake skill root: scripts/ (copy of adp.py + modules) and refs/
        self.root = os.path.join(self.tmp, 'skill')
        shutil.copytree(SRC, os.path.join(self.root, 'scripts'), ignore=shutil.ignore_patterns('__pycache__'))
        ref = os.path.join(self.root, 'refs', 'adp-new'); os.makedirs(os.path.join(ref, 'sub'))
        open(os.path.join(ref, 'SKILL.md'), 'w').write('---\nname: adp-new\nmetadata:\n  version: 1.2.3\n---\nbody\n')
        open(os.path.join(ref, 'sub', 'x.txt'), 'w').write('x')
        os.makedirs(os.path.join(self.root, 'refs', 'adp-edit'))
        open(os.path.join(self.root, 'refs', 'adp-edit', 'SKILL.md'), 'w').write('---\nname: adp-edit\n---\n')
        self.adp = os.path.join(self.root, 'scripts', 'adp.py')

    def run_adp(self, *args, cwd=None):
        env = {k: v for k, v in os.environ.items() if k != 'ADP_HOME'}
        env['HOME'] = self.home
        return subprocess.run([sys.executable, '-I', self.adp, *args], cwd=cwd or self.cwd, env=env,
                              capture_output=True, text=True)

    def snapshot(self):
        return sorted(os.path.join(d, f) for d, _, fs in os.walk(self.tmp) for f in fs
                      if os.path.join(self.tmp, 'skill') not in d)


class SetupTests(Base):
    def test_dry_run_writes_nothing(self):
        before = self.snapshot()
        for scope in ('user', 'project', 'local'):
            r = self.run_adp('setup', '--scope', scope, '--dry-run', '--yes')
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertLessEqual(len(r.stdout.strip().split('\n')), 8)
        self.assertEqual(self.snapshot(), before)
        self.assertFalse(os.path.exists(os.path.join(self.cwd, '.adp')))

    def test_yes_user_scope_idempotent(self):
        def state():
            out = {}
            for d, _, fs in os.walk(self.home):
                for f in fs:
                    if f == 'log.jsonl': continue
                    p = os.path.join(d, f); out[p] = open(p).read()
            c = os.path.join(self.home, '.adp', 'config.json'); cfg = json.load(open(c)); cfg.pop('at')
            out[c] = cfg
            return out
        self.assertEqual(self.run_adp('setup', '--yes').returncode, 0)
        s1 = state()
        sk = os.path.join(self.home, '.claude', 'skills')
        self.assertTrue(os.path.isfile(os.path.join(sk, 'adp-new', 'sub', 'x.txt')))
        cfg = json.load(open(os.path.join(self.home, '.adp', 'config.json')))
        self.assertEqual((cfg['schema'], cfg['scope'], cfg['skills']), ('adp-setup/1', 'user', ['adp-edit', 'adp-new']))
        self.assertEqual(cfg['version'], {'adp-new': '1.2.3'})
        ptr = open(os.path.join(self.home, '.claude', 'CLAUDE.md')).read()
        self.assertEqual(ptr.count('<!-- adp:begin -->'), 1)
        self.assertIn('python3 -I', ptr); self.assertIn(self.adp, ptr)
        self.run_adp('setup', '--yes')
        self.assertEqual(state(), s1)

    def test_project_scope_gitignore_and_replace_block(self):
        ptr = os.path.join(self.cwd, 'CLAUDE.md')
        open(ptr, 'w').write('keep\n<!-- adp:begin -->\nold\n<!-- adp:end -->\nafter\n')
        for _ in range(2): self.run_adp('setup', '--scope', 'project', '--yes')
        t = open(ptr).read()
        self.assertTrue(t.startswith('keep\n')); self.assertTrue(t.endswith('after\n'))
        self.assertNotIn('old', t); self.assertEqual(t.count('adp:begin'), 1)
        gi = open(os.path.join(self.cwd, '.gitignore')).read().split('\n')
        self.assertEqual(gi.count('.adp/log.jsonl'), 1)
        self.assertTrue(os.path.isfile(os.path.join(self.cwd, '.claude', 'skills', 'adp-edit', 'SKILL.md')))
        self.assertTrue(os.path.isfile(os.path.join(self.cwd, '.adp', 'config.json')))

    def test_local_scope_and_other_skills_kept(self):
        other = os.path.join(self.cwd, '.claude', 'skills', 'mine'); os.makedirs(other)
        open(os.path.join(other, 'SKILL.md'), 'w').write('m')
        self.run_adp('setup', '--scope', 'local', '--yes')
        self.assertTrue(os.path.isfile(os.path.join(other, 'SKILL.md')))
        self.assertIn('adp:begin', open(os.path.join(self.cwd, 'CLAUDE.local.md')).read())

    def test_without_yes_no_pointer(self):
        self.run_adp('setup', '--scope', 'project')
        self.assertFalse(os.path.exists(os.path.join(self.cwd, 'CLAUDE.md')))
        self.assertFalse(os.path.exists(os.path.join(self.cwd, '.gitignore')))


class LogInitTests(Base):
    def read_log(self, p):
        return [json.loads(l) for l in open(p).read().splitlines()]

    def test_secrets_redacted_and_fields(self):
        os.makedirs(os.path.join(self.cwd, '.adp')); sub = os.path.join(self.cwd, 'a', 'b'); os.makedirs(sub)
        self.run_adp('bogus', '--token', 'SEKRET1', '--api-key=SEKRET2', '--password', 'SEKRET3', '--name', 'ok', cwd=sub)
        p = os.path.join(self.cwd, '.adp', 'log.jsonl')
        txt = open(p).read()
        for s in ('SEKRET1', 'SEKRET2', 'SEKRET3'): self.assertNotIn(s, txt)
        rec = self.read_log(p)[-1]
        self.assertEqual(rec['args'], ['--token', '***', '--api-key=***', '--password', '***', '--name', 'ok'])
        self.assertEqual(rec['cmd'], 'bogus')
        for k in ('ts', 'exit', 'duration_ms', 'cwd'): self.assertIn(k, rec)
        self.assertTrue(rec['ts'].endswith('Z'))

    def test_log_falls_back_to_home_and_log_cmd(self):
        for _ in range(3): self.run_adp('bogus')
        p = os.path.join(self.home, '.adp', 'log.jsonl')
        self.assertEqual(len(self.read_log(p)), 3)
        r = self.run_adp('log', '-n', '2')
        self.assertEqual(len(r.stdout.strip().split('\n')), 2)

    @unittest.skipIf(hasattr(os, 'geteuid') and os.geteuid() == 0, 'root ignores read-only modes')
    def test_log_never_raises_readonly(self):
        d = os.path.join(self.cwd, '.adp'); os.makedirs(d); os.chmod(d, 0o500)
        try:
            r = self.run_adp('init', os.path.join(self.tmp, 'other'))
            self.assertEqual(r.returncode, 0, r.stderr)
        finally: os.chmod(d, 0o700)

    def test_log_never_raises_unwritable_path(self):
        os.makedirs(os.path.join(self.cwd, '.adp', 'log.jsonl'))   # a directory where the file should be
        r = self.run_adp('init', os.path.join(self.tmp, 'other'))
        self.assertEqual(r.returncode, 0, r.stderr); self.assertNotIn('Traceback', r.stderr)

    def test_init_idempotent(self):
        t = os.path.join(self.tmp, 'myproj'); os.makedirs(t)
        r = self.run_adp('init', t); self.assertEqual(len(r.stdout.strip().split('\n')), 1)
        p = os.path.join(t, '.adp', 'config.json'); c1 = open(p).read()
        cfg = json.loads(c1); self.assertEqual((cfg['schema'], cfg['name']), ('adp-project/1', 'myproj'))
        r = self.run_adp('init', t); self.assertEqual(r.returncode, 0)
        self.assertEqual(open(p).read(), c1)
        self.run_adp('init'); self.assertTrue(os.path.isfile(os.path.join(self.cwd, '.adp', 'config.json')))


if __name__ == '__main__':
    unittest.main()
