"""The repo is also a Claude Code plugin: .claude-plugin/plugin.json at the root serves the adp skill and the four road skills from skill/ as they are.
A marketplace installs and updates it. In that install `adp.py setup` copies no road skill and records no path, since the plugin's folder changes with its version."""
import json
import os
import sys
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

    def test_name_and_no_pinned_version(self):
        self.assertEqual(self.m['name'], NAME)       # not `adp`: the Artifact Data Protocol's own plugin has that name
        # no version on purpose: Claude Code then takes the commit as the version, so every commit on the default branch is an update
        # and nothing has to be bumped. A version here would pin every install to it until someone changed the number.
        self.assertNotIn('version', self.m)
        self.assertEqual(self.m['license'], 'Apache-2.0')

    def test_it_serves_the_adp_skill_and_the_four_roads(self):
        found = []
        for p in self.m['skills']:
            self.assertTrue(p.startswith('./'), p)
            self.assertTrue(os.path.isdir(os.path.join(ROOT, p)), p)
            found += skill_names(os.path.join(ROOT, p))
        self.assertEqual(sorted(found), ['adp', 'adp-adopt', 'adp-catalog', 'adp-edit', 'adp-new'])
        self.assertFalse(os.path.exists(os.path.join(ROOT, 'skills')))      # a default skills/ folder at the root would be scanned too


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
