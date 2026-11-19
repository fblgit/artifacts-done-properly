"""The repo is also a Claude Code plugin: .claude-plugin/plugin.json at the root serves the adp skill and the four road skills from skill/ as they are.
A marketplace installs and updates it. In that install `adp.py setup` copies no road skill and records no path, since the plugin's folder changes with its version."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import package  # noqa: E402
from test_setup import Base  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, '.claude-plugin', 'plugin.json')
NAME = 'artifacts-done-properly'


def frontmatter(md):
    with open(md, encoding='utf-8') as f:
        return package.parse_frontmatter(f.read())


def skill_names(folder):
    """What Claude Code finds under a `skills` path: the folder itself when it holds SKILL.md, else each child folder that does."""
    if os.path.isfile(os.path.join(folder, 'SKILL.md')):
        return [frontmatter(os.path.join(folder, 'SKILL.md'))['name']]
    return [frontmatter(os.path.join(folder, d, 'SKILL.md'))['name'] for d in sorted(os.listdir(folder))
            if os.path.isfile(os.path.join(folder, d, 'SKILL.md'))]


class Manifest(unittest.TestCase):
    def setUp(self):
        with open(MANIFEST, encoding='utf-8') as f:
            self.m = json.load(f)

    def test_name_and_version_follow_adp(self):
        self.assertEqual(self.m['name'], NAME)       # not `adp`: the Artifact Data Protocol's own plugin has that name
        # the plugin's version is ADP's: the one in skill/SKILL.md (metadata.version), which a release tag carries. A release bumps both.
        self.assertEqual(self.m['version'], frontmatter(os.path.join(ROOT, 'skill', 'SKILL.md'))['metadata']['version'])
        self.assertEqual(self.m['license'], 'Apache-2.0')

    def test_it_serves_the_adp_skill_and_the_four_roads(self):
        found = []
        for p in self.m['skills']:
            self.assertTrue(p.startswith('./'), p)
            self.assertTrue(os.path.isdir(os.path.join(ROOT, p)), p)
            found += skill_names(os.path.join(ROOT, p))
        self.assertEqual(sorted(found), ['adp', 'adp-adopt', 'adp-catalog', 'adp-edit', 'adp-new'])
        self.assertFalse(os.path.exists(os.path.join(ROOT, 'skills')))      # a default skills/ folder at the root would be scanned too


class BuiltPlugin(unittest.TestCase):
    """`tools/package.py --plugin` writes the layout the plugin directory expects: skills/<name>/SKILL.md, no skill inside another skill's folder."""
    @classmethod
    def setUpClass(cls):
        cls.out = tempfile.mkdtemp()
        cls.addClassCleanup(shutil.rmtree, cls.out, True)
        package.build_plugin(os.path.join(ROOT, 'skill'), cls.out)
        cls.tree = os.path.join(cls.out, 'plugin')

    def test_five_skills_side_by_side(self):
        skills = os.path.join(self.tree, 'skills')
        self.assertEqual(sorted(os.listdir(skills)), ['adp', 'adp-adopt', 'adp-catalog', 'adp-edit', 'adp-new'])
        for n in os.listdir(skills):
            self.assertEqual(frontmatter(os.path.join(skills, n, 'SKILL.md'))['name'], n)

    def test_no_skill_inside_a_skill(self):
        found = [os.path.relpath(os.path.join(d, f), self.tree) for d, _, fs in os.walk(self.tree) for f in fs if f == 'SKILL.md']
        self.assertEqual(sorted(found), sorted('skills/%s/SKILL.md' % n for n in os.listdir(os.path.join(self.tree, 'skills'))))
        self.assertFalse(os.path.exists(os.path.join(self.tree, 'skills', 'adp', 'refs', 'adp-new')))
        self.assertTrue(os.path.isfile(os.path.join(self.tree, 'skills', 'adp', 'refs', 'local-bus.md')))     # the guides stay in the base skill

    def test_manifest_has_no_skills_key_and_keeps_the_rest(self):
        with open(os.path.join(self.tree, '.claude-plugin', 'plugin.json'), encoding='utf-8') as f:
            built = json.load(f)
        with open(MANIFEST, encoding='utf-8') as f:
            src = json.load(f)
        src.pop('skills')
        self.assertEqual(built, src)
        self.assertTrue(os.path.isfile(os.path.join(self.tree, 'LICENSE')) and os.path.isfile(os.path.join(self.tree, 'NOTICE')))

    def test_setup_in_the_built_tree_is_a_plugin_install(self):
        home = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, home, True)
        env = {k: v for k, v in os.environ.items() if k != 'ADP_HOME'}
        env['HOME'] = home
        r = subprocess.run([sys.executable, '-I', os.path.join(self.tree, 'skills', 'adp', 'scripts', 'adp.py'), 'setup', '--dry-run'],
                           env=env, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('the 4 road skills (adp-adopt, adp-catalog, adp-edit, adp-new) come with the plugin %s' % NAME, r.stdout)


class PluginSetup(Base):
    """setup run from a plugin install: the fake skill root of Base, with a plugin manifest beside it."""
    def setUp(self):
        super().setUp()
        os.makedirs(os.path.join(self.tmp, '.claude-plugin'))
        self.manifest = os.path.join(self.tmp, '.claude-plugin', 'plugin.json')
        with open(self.manifest, 'w') as f:
            json.dump({'name': NAME}, f)
        self.skills = os.path.join(self.home, '.claude', 'skills')

    def test_dry_run_says_the_roads_come_with_the_plugin(self):
        r = self.run_adp('setup', '--dry-run')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('come with the plugin %s and are not copied' % NAME, r.stdout)
        self.assertIn('`%s:adp` skill' % NAME, r.stdout)

    def test_no_road_skill_is_copied_and_no_path_is_recorded(self):
        r = self.run_adp('setup', '--scope', 'user', '--yes')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(os.path.exists(self.skills))
        with open(os.path.join(self.home, '.adp', 'config.json')) as f:
            cfg = json.load(f)
        self.assertEqual(cfg['plugin'], NAME)
        self.assertNotIn('skill_root', cfg)
        self.assertEqual(cfg['skills'], ['adp-edit', 'adp-new'])
        with open(os.path.join(self.home, '.claude', 'CLAUDE.md')) as f:
            ptr = f.read()
        self.assertIn('`%s:adp` skill' % NAME, ptr)
        self.assertNotIn(self.root, ptr)      # the pointer names the skill: a path would break at the next plugin version

    def test_a_copy_from_an_earlier_install_is_left_alone(self):
        old = os.path.join(self.skills, 'adp-new', 'SKILL.md')
        os.makedirs(os.path.dirname(old))
        with open(old, 'w') as f:
            f.write('an older copy')
        r = self.run_adp('setup', '--scope', 'user')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertNotIn('replace', r.stdout)
        with open(old) as f:
            self.assertEqual(f.read(), 'an older copy')

    def test_a_broken_manifest_means_a_plain_install(self):
        with open(self.manifest, 'w') as f:
            f.write('{not json')
        self.assertEqual(self.run_adp('setup', '--scope', 'user').returncode, 0)
        self.assertTrue(os.path.isfile(os.path.join(self.skills, 'adp-new', 'SKILL.md')))


if __name__ == '__main__':
    unittest.main()
