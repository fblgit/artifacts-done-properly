import os
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import package  # noqa: E402


def fm(name="adp", desc="Does a thing.", extra=""):
    return "---\nname: %s\ndescription: %s\nmetadata:\n  version: \"1.0.0\"\n%s---\n\nBody\n" % (name, desc, extra)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.skill = os.path.join(self.tmp.name, "skill")
        self.out = os.path.join(self.tmp.name, "dist")
        for n in ("LICENSE", "NOTICE"):       # beside the skill folder, as in the repository
            with open(os.path.join(self.tmp.name, n), "w", encoding="utf-8") as f:
                f.write(n + "\n")
        write(os.path.join(self.skill, "SKILL.md"), fm())
        write(os.path.join(self.skill, "refs", "alpha", "SKILL.md"), fm("alpha"))
        write(os.path.join(self.skill, "scripts", "run.py"), "print(1)\n")

    def check(self):
        return package.validate_tree(self.skill)[0]


class ValidationTests(Base):
    def test_valid_tree(self):
        self.assertEqual(self.check(), [])
        self.assertEqual(package.main(["--skill-dir", self.skill, "--out", self.out]), 0)
        self.assertTrue(os.path.isfile(os.path.join(self.out, "adp.skill")))

    def test_check_only_does_not_build(self):
        self.assertEqual(package.main(["--skill-dir", self.skill, "--out", self.out, "--check"]), 0)
        self.assertFalse(os.path.exists(self.out))

    def test_missing_skill_md(self):
        os.remove(os.path.join(self.skill, "SKILL.md"))
        self.assertTrue(self.check())
        self.assertEqual(package.main(["--skill-dir", self.skill, "--out", self.out]), 1)

    def test_bad_names(self):
        for bad in ("Adp", "a--b", "-a", "a-", "a_b", "x" * 65):
            write(os.path.join(self.skill, "SKILL.md"), fm(bad))
            self.assertTrue(self.check(), bad)

    def test_description_too_long(self):
        write(os.path.join(self.skill, "SKILL.md"), fm(desc="x" * 1025))
        self.assertTrue(self.check())
        write(os.path.join(self.skill, "SKILL.md"), fm(desc="x" * 1024))
        self.assertEqual(self.check(), [])

    def test_angle_brackets(self):
        write(os.path.join(self.skill, "SKILL.md"), fm(desc="use <b> here"))
        self.assertTrue(self.check())

    def test_must_start_with_dashes(self):
        write(os.path.join(self.skill, "SKILL.md"), "\n" + fm())
        self.assertTrue(self.check())

    def test_ref_folder_name_mismatch(self):
        write(os.path.join(self.skill, "refs", "beta", "SKILL.md"), fm("gamma"))
        errs = self.check()
        self.assertTrue(any("beta" in e for e in errs))

    def test_ref_bad_description(self):
        write(os.path.join(self.skill, "refs", "alpha", "SKILL.md"), fm("alpha", "a > b"))
        self.assertTrue(self.check())

    def test_quoted_values_and_unknown_key_warns(self):
        write(os.path.join(self.skill, "SKILL.md"),
              "---\nname: 'adp'\ndescription: \"quoted: value\"\nfoo: bar\n---\n")
        errs, warns, data = package.validate_tree(self.skill)
        self.assertEqual(errs, [])
        self.assertTrue(warns)
        self.assertEqual(data["description"], "quoted: value")


class BuildTests(Base):
    def populate_excluded(self):
        write(os.path.join(self.skill, "scripts", "__pycache__", "x.pyc"), "x")
        write(os.path.join(self.skill, "scripts", "y.pyc"), "x")
        write(os.path.join(self.skill, "node_modules", "m", "i.js"), "x")
        write(os.path.join(self.skill, ".DS_Store"), "x")
        write(os.path.join(self.skill, "evals", "e.json"), "{}")
        write(os.path.join(self.skill, "refs", "alpha", "evals", "keep.md"), "kept")

    def names(self):
        with zipfile.ZipFile(os.path.join(self.out, "adp.skill")) as z:
            return z.namelist()

    def test_layout_and_exclusions(self):
        self.populate_excluded()
        package.build(self.skill, self.out)
        names = self.names()
        self.assertEqual({n.split("/")[0] for n in names}, {"adp"})
        self.assertIn("adp/SKILL.md", names)
        self.assertIn("adp/refs/alpha/SKILL.md", names)
        self.assertIn("adp/refs/alpha/evals/keep.md", names)
        self.assertEqual(names, sorted(names))
        for n in names:
            self.assertNotIn("__pycache__", n)
            self.assertNotIn("node_modules", n)
            self.assertFalse(n.endswith(".pyc"))
            self.assertFalse(n.endswith(".DS_Store"))
            self.assertFalse(n.startswith("adp/evals/"))

    def test_deterministic(self):
        _, _, _, sha1 = package.build(self.skill, self.out)
        with open(os.path.join(self.out, "adp.skill"), "rb") as f:
            a = f.read()
        os.utime(os.path.join(self.skill, "SKILL.md"), (1, 1))
        out2 = os.path.join(self.tmp.name, "dist2")
        _, _, _, sha2 = package.build(self.skill, out2)
        with open(os.path.join(out2, "adp.skill"), "rb") as f:
            b = f.read()
        self.assertEqual(a, b)
        self.assertEqual(sha1, sha2)

    def test_timestamps_and_sha_file(self):
        _, _, _, sha = package.build(self.skill, self.out)
        with zipfile.ZipFile(os.path.join(self.out, "adp.skill")) as z:
            for i in z.infolist():
                self.assertEqual(i.date_time, (1980, 1, 1, 0, 0, 0))
        with open(os.path.join(self.out, "adp.skill.sha256")) as f:
            self.assertEqual(f.read(), "%s  adp.skill\n" % sha)


if __name__ == "__main__":
    unittest.main()
