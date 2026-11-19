"""The legal files: Apache-2.0 text, NOTICE, CITATION.cff and the skill's own license field agree, and the bundle carries LICENSE and NOTICE."""
import hashlib
import os
import re
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


class LegalFiles(unittest.TestCase):
    def test_license_is_the_apache_2_text(self):
        t = read('LICENSE')
        self.assertIn('Apache License\n                           Version 2.0, January 2004', t)
        self.assertIn('END OF TERMS AND CONDITIONS', t)
        self.assertEqual(hashlib.sha256(t.encode()).hexdigest(), 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30')   # the standard Apache-2.0 text, as in Debian's common-licenses

    def test_notice_names_the_project_and_owner(self):
        t = read('NOTICE')
        self.assertIn('Artifacts Done Properly (ADP)', t)
        self.assertRegex(t, r'Copyright 20\d\d Xavier Murias')

    def test_citation_agrees_with_the_skill_and_the_license(self):
        c = read('CITATION.cff')
        self.assertIn('license: Apache-2.0', c)
        self.assertIn('NOTICE', c)
        skill = read('plugins/artifacts-done-properly/skills/adp/SKILL.md').split('---')[1]
        self.assertIn('license: Apache-2.0', skill)
        self.assertEqual(re.search(r'^version: (\S+)$', c, re.M).group(1), re.search(r'version: "([^"]+)"', skill).group(1))

    def test_the_plugin_folder_carries_the_same_license_and_notice(self):
        for n in ('LICENSE', 'NOTICE'):       # the directory reads the plugin folder alone, GitHub the repo root: one text in both
            self.assertEqual(read('plugins/artifacts-done-properly/' + n), read(n), n)

    def test_bundle_carries_license_and_notice_unchanged(self):
        out = tempfile.mkdtemp()
        r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'package.py'), '--out', out], capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(r.returncode, 0, r.stderr)
        z = zipfile.ZipFile(os.path.join(out, 'adp.skill'))
        for n in ('LICENSE', 'NOTICE'):
            self.assertEqual(z.read('adp/' + n).decode('utf-8'), read(n), n)


if __name__ == '__main__':
    unittest.main()
