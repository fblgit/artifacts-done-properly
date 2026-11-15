import json, os, shutil, subprocess, sys, tempfile, unittest

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'skill', 'scripts')


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = os.path.realpath(tempfile.mkdtemp())  # macOS: /var is a symlink to /private/var, and adp.py reports the resolved path
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

    def test_help_prints_usage_and_writes_nothing(self):
        before = self.snapshot()
        for args in (('--help',), ('-h',), ('--scope', 'user', '--yes', '--help')):
            r = self.run_adp('setup', *args)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn('usage: adp.py setup', r.stdout); self.assertNotIn('skill_root', r.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_refuses_to_guess(self):
        """No --scope, or an argument setup does not know: usage, exit 1, no skills and no config."""
        for args in ((), ('--yes',), ('--scope', 'user', '--force'), ('user',), ('--scope',)):
            r = self.run_adp('setup', *args)
            self.assertEqual(r.returncode, 1, args); self.assertIn('usage: adp.py setup', r.stderr); self.assertEqual(r.stdout, '')
        self.assertEqual([p for p in self.snapshot() if not p.endswith('log.jsonl')], [])
        self.assertEqual(self.run_adp('setup', '--dry-run').returncode, 0)      # a dry run may still guess: it writes nothing

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
        self.assertEqual(self.run_adp('setup', '--scope', 'user', '--yes').returncode, 0)
        s1 = state()
        sk = os.path.join(self.home, '.claude', 'skills')
        self.assertTrue(os.path.isfile(os.path.join(sk, 'adp-new', 'sub', 'x.txt')))
        cfg = json.load(open(os.path.join(self.home, '.adp', 'config.json')))
        self.assertEqual((cfg['schema'], cfg['scope'], cfg['skills']), ('adp-setup/1', 'user', ['adp-edit', 'adp-new']))
        self.assertEqual(cfg['version'], {'adp-new': '1.2.3'})
        ptr = open(os.path.join(self.home, '.claude', 'CLAUDE.md')).read()
        self.assertEqual(ptr.count('<!-- adp:begin -->'), 1)
        self.assertIn('python3 -I', ptr); self.assertIn(self.adp, ptr)
        self.run_adp('setup', '--scope', 'user', '--yes')
        self.assertEqual(state(), s1)

    def test_project_scope_gitignore_and_replace_block(self):
        ptr = os.path.join(self.cwd, 'CLAUDE.md')
        open(ptr, 'w').write('keep\n<!-- adp:begin -->\nold\n<!-- adp:end -->\nafter\n')
        for _ in range(2): self.run_adp('setup', '--scope', 'project', '--yes')
        t = open(ptr).read()
        self.assertTrue(t.startswith('keep\n')); self.assertTrue(t.endswith('after\n'))
        self.assertNotIn('\nold\n', t); self.assertEqual(t.count('adp:begin'), 1)  # the whole line: a temp path may hold 'old' (/var/folders)
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


class ProjectsTests(Base):
    def reg(self):
        root = os.path.join(self.home, '.adp', 'projects')
        return {n: json.load(open(os.path.join(root, n, 'config.json'))) for n in sorted(os.listdir(root))} if os.path.isdir(root) else {}

    def test_init_registers_path_in_home(self):
        t = os.path.join(self.tmp, 'My Proj'); os.makedirs(t)
        self.assertEqual(self.run_adp('init', t).returncode, 0)
        r = self.reg(); self.assertEqual(list(r), ['my-proj'])
        self.assertEqual((r['my-proj']['path'], r['my-proj']['scope'], r['my-proj']['name']), (t, 'project', 'My Proj'))
        c1 = r['my-proj']['created']
        self.assertEqual(self.run_adp('init', t).returncode, 0)          # again: one entry, same created
        r = self.reg(); self.assertEqual(list(r), ['my-proj']); self.assertEqual(r['my-proj']['created'], c1)

    def test_same_name_two_folders(self):
        a, b = os.path.join(self.tmp, 'x', 'app'), os.path.join(self.tmp, 'y', 'app')
        for d in (a, b): os.makedirs(d); self.run_adp('init', d)
        r = self.reg(); self.assertEqual(sorted(v['path'] for v in r.values()), sorted([a, b])); self.assertEqual(len(r), 2)

    def test_setup_project_registers_dry_run_does_not(self):
        self.run_adp('setup', '--scope', 'project', '--dry-run', '--yes')
        self.assertEqual(self.reg(), {})
        self.assertEqual(self.run_adp('setup', '--scope', 'local', '--yes').returncode, 0)
        r = self.reg(); self.assertEqual([v['path'] for v in r.values()], [self.cwd]); self.assertEqual(list(r.values())[0]['scope'], 'local')
        self.run_adp('setup', '--scope', 'user', '--yes'); self.assertEqual(len(self.reg()), 1)    # user scope is not a project

    def test_projects_lists_and_marks_missing(self):
        r = self.run_adp('projects'); self.assertIn('no projects registered', r.stdout)
        t = os.path.join(self.tmp, 'gone'); os.makedirs(t); self.run_adp('init', t)
        out = self.run_adp('projects', cwd=self.tmp).stdout        # from outside the project
        self.assertEqual(out.strip().split('\t'), ['gone', 'project', t])
        shutil.rmtree(t); self.assertIn('(missing)', self.run_adp('projects').stdout)


if __name__ == '__main__':
    unittest.main()


class SetupSafetyTests(Base):
    def skill_dir(self):
        return os.path.join(self.cwd, '.claude', 'skills')

    def test_differing_folder_is_replaced_and_reported(self):
        """An update is an update: an older copy (or a local edit) of a road skill becomes the packaged one."""
        self.assertEqual(self.run_adp('setup', '--scope', 'project').returncode, 0)
        mine = os.path.join(self.skill_dir(), 'adp-new', 'SKILL.md')
        packaged = open(mine).read()
        open(mine, 'w').write('an older copy')
        d = self.run_adp('setup', '--scope', 'project', '--dry-run')
        self.assertIn('would replace ' + os.path.dirname(mine), d.stdout)
        self.assertEqual(open(mine).read(), 'an older copy')       # the dry run only says so
        r = self.run_adp('setup', '--scope', 'project')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(open(mine).read(), packaged)
        self.assertIn('replaced ' + os.path.dirname(mine), r.stdout)
        self.assertNotIn('adp-edit', ''.join(l for l in r.stdout.split('\n') if l.startswith('replaced')))

    def test_extra_file_is_removed(self):
        self.run_adp('setup', '--scope', 'project')
        extra = os.path.join(self.skill_dir(), 'adp-edit', 'note.txt'); open(extra, 'w').write('n')
        r = self.run_adp('setup', '--scope', 'project')
        self.assertIn('replaced ' + os.path.dirname(extra), r.stdout)
        self.assertFalse(os.path.exists(extra))

    def test_update_keeps_the_config(self):
        """Road skills are replaced on an update; the config is not: what the owner put there stays."""
        c = os.path.join(self.home, '.adp', 'config.json'); os.makedirs(os.path.dirname(c))
        json.dump({'catalog': 'https://claude.ai/artifact/mine', 'my_key': [1, 2], 'skill_root': '/elsewhere/adp'}, open(c, 'w'))
        for _ in range(2):
            self.assertEqual(self.run_adp('setup', '--scope', 'user').returncode, 0)
            cfg = json.load(open(c))
            self.assertEqual((cfg['catalog'], cfg['my_key']), ('https://claude.ai/artifact/mine', [1, 2]))
            self.assertEqual(cfg['skill_root'], '/elsewhere/adp')       # a value already there is never overwritten
            self.assertEqual((cfg['schema'], cfg['scope']), ('adp-setup/1', 'user'))      # the keys it lacked are added
        at = cfg['at']; self.run_adp('setup', '--scope', 'user'); self.assertEqual(json.load(open(c))['at'], at)

    def test_identical_folder_is_not_reported(self):
        self.run_adp('setup', '--scope', 'project')
        r = self.run_adp('setup', '--scope', 'project')
        self.assertNotIn('replace', r.stdout)

    def test_dry_run_appends_no_log_line(self):
        os.makedirs(os.path.join(self.cwd, '.adp'))
        r = self.run_adp('setup', '--scope', 'project', '--dry-run')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(os.path.exists(os.path.join(self.cwd, '.adp', 'log.jsonl')))


class CatalogTests(Base):
    """setup puts the kit the skill folder ships into ~/.adp/catalog (My Own Kit): from its catalog.zip (a skill zip) or its catalog/ folder (a plugin, a clone)."""
    FILES = {'catalog.json': b'{"entries": []}', 'kit/a.js': b'A', 'kit/themes/t.css': b'T'}

    def ship_zip(self, extra=None):
        import zipfile
        with zipfile.ZipFile(os.path.join(self.root, 'catalog.zip'), 'w') as z:
            for k, v in {**self.FILES, **(extra or {})}.items(): z.writestr(k, v)

    def mine(self, rel): return os.path.join(self.home, '.adp', 'catalog', rel)

    def test_unpacks_the_shipped_zip_and_leaves_a_file_that_is_already_there(self):
        self.ship_zip()
        os.makedirs(os.path.dirname(self.mine('kit/a.js'))); open(self.mine('kit/a.js'), 'wb').write(b'NEWER')      # fetched from the live catalog
        r = self.run_adp('setup', '--scope', 'user')
        self.assertEqual(r.returncode, 0, r.stderr); self.assertIn('3 shipped files, 2 added', r.stdout)
        self.assertEqual(open(self.mine('kit/a.js'), 'rb').read(), b'NEWER')
        self.assertEqual(open(self.mine('kit/themes/t.css'), 'rb').read(), b'T'); self.assertTrue(os.path.isfile(self.mine('catalog.json')))
        self.assertIn('0 added', self.run_adp('setup', '--scope', 'user').stdout)      # a second setup adds nothing

    def test_dry_run_writes_no_catalog(self):
        self.ship_zip()
        r = self.run_adp('setup', '--scope', 'user', '--dry-run')
        self.assertIn('3 would be added', r.stdout); self.assertFalse(os.path.exists(self.mine('')))

    def test_unpacks_a_catalog_folder_when_the_skill_ships_one(self):
        for k, v in self.FILES.items():
            p = os.path.join(self.root, 'catalog', k); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, 'wb').write(v)
        self.assertIn('3 shipped files, 3 added', self.run_adp('setup', '--scope', 'user').stdout)
        self.assertEqual(open(self.mine('kit/a.js'), 'rb').read(), b'A')

    def test_a_zip_entry_that_climbs_out_is_never_written(self):
        self.ship_zip({'../evil.txt': b'x', '/abs.txt': b'x'})
        self.run_adp('setup', '--scope', 'user')
        self.assertFalse(os.path.exists(os.path.join(self.home, '.adp', 'evil.txt'))); self.assertFalse(os.path.exists('/abs.txt'))

    def test_no_shipped_catalog_says_so_and_writes_none(self):
        r = self.run_adp('setup', '--scope', 'user')
        self.assertIn('ships none', r.stdout); self.assertFalse(os.path.exists(self.mine('')))
