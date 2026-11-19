"""The plugin is the folder plugins/artifacts-done-properly: the standard layout (.claude-plugin/, skills/<name>/SKILL.md, no skill inside a skill),
submitted to the plugin directory on its own. The repository root only lists it in a marketplace. `adp.py setup` run from a plugin install copies
no road skill and records no path, since the plugin's folder changes with its version."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import package  # noqa: E402
from test_setup import Base  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN = os.path.join(ROOT, 'plugins', 'artifacts-done-properly')
MANIFEST = os.path.join(PLUGIN, '.claude-plugin', 'plugin.json')
NAME = 'artifacts-done-properly'


def frontmatter(md):
    with open(md, encoding='utf-8') as f:
        return package.parse_frontmatter(f.read())


class Manifest(unittest.TestCase):
    def setUp(self):
        with open(MANIFEST, encoding='utf-8') as f:
            self.m = json.load(f)

    def test_name_and_version_follow_adp(self):
        self.assertEqual(self.m['name'], NAME)       # not `adp`: the Artifact Data Protocol's own plugin has that name
        # the plugin's version is ADP's: the one in the adp skill (metadata.version), which a release tag carries. A release bumps both.
        self.assertEqual(self.m['version'], frontmatter(os.path.join(PLUGIN, 'skills', 'adp', 'SKILL.md'))['metadata']['version'])
        self.assertEqual(self.m['license'], 'Apache-2.0')

    def test_no_skills_key_the_layout_is_the_default(self):
        self.assertNotIn('skills', self.m)       # Claude Code finds skills/<name>/ by itself

    def test_the_icon_is_where_the_directory_looks(self):
        self.assertTrue(os.path.isfile(os.path.join(PLUGIN, '.claude-plugin', 'icon.png')))


class Layout(unittest.TestCase):
    def test_five_skills_side_by_side(self):
        skills = os.path.join(PLUGIN, 'skills')
        self.assertEqual(sorted(os.listdir(skills)), ['adp', 'adp-adopt', 'adp-catalog', 'adp-edit', 'adp-new'])
        for n in os.listdir(skills):
            self.assertEqual(frontmatter(os.path.join(skills, n, 'SKILL.md'))['name'], n)

    def test_no_skill_inside_a_skill(self):
        found = [os.path.relpath(os.path.join(d, f), PLUGIN) for d, _, fs in os.walk(PLUGIN) for f in fs if f == 'SKILL.md']
        self.assertEqual(sorted(found), sorted('skills/%s/SKILL.md' % n for n in os.listdir(os.path.join(PLUGIN, 'skills'))))
        self.assertFalse(os.path.exists(os.path.join(PLUGIN, 'skills', 'adp', 'refs', 'adp-new')))
        self.assertTrue(os.path.isfile(os.path.join(PLUGIN, 'skills', 'adp', 'refs', 'local-bus.md')))     # the guides stay in the base skill

    def test_the_directory_reads_a_readme_and_the_legal_files(self):
        for n in ('README.md', 'LICENSE', 'NOTICE'):
            self.assertTrue(os.path.isfile(os.path.join(PLUGIN, n)), n)

    def test_the_repo_root_holds_no_plugin_manifest_only_the_marketplace(self):
        self.assertFalse(os.path.exists(os.path.join(ROOT, '.claude-plugin', 'plugin.json')))
        with open(os.path.join(ROOT, '.claude-plugin', 'marketplace.json'), encoding='utf-8') as f:
            m = json.load(f)
        self.assertEqual([(p['name'], p['source']) for p in m['plugins']], [(NAME, './plugins/' + NAME)])
        self.assertFalse(os.path.exists(os.path.join(ROOT, 'skill')))
        self.assertFalse(os.path.exists(os.path.join(ROOT, 'skills')))

    def test_package_check_passes_on_the_plugin_folder(self):
        errors, _, _ = package.validate_tree(PLUGIN)
        self.assertEqual(errors, [])


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
