"""Cheap checks that runtime and kit text matches the code it describes."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAT = ROOT / "skill" / "catalog"


def read(p):
    return Path(p).read_text(encoding="utf-8")


class RuntimeTruth(unittest.TestCase):
    def test_one_runtime(self):
        self.assertEqual((ROOT / "skill/assets/adp.js").read_bytes(), (CAT / "adp.js").read_bytes())

    def test_runtime_help_says_what_the_code_does(self):
        js = read(CAT / "adp.js")
        self.assertIn("CSS only", js)
        self.assertIn("adp.py record --holds", js)
        self.assertIn("Sets data-adp-theme on the page for your own CSS; the kit does not read it.", js)
        self.assertIn("Sets data-adp-density on the page for your own CSS; the kit does not read it.", js)
        self.assertEqual(js.count("Reserved: stored and shown, nothing reads it yet."), 4)
        self.assertIn("attempted for any viewer with a db", js)

    def test_inbox_presence_default_is_assist_default(self):
        line = [ln for ln in read(CAT / "kit/patterns/inbox.js").splitlines() if "cfg.get('assist.presence-minutes')" in ln][0]
        self.assertNotIn("|| 10", line)
        self.assertIn("|| 5", line)

    def test_presence_counts_the_platforms_own_answer(self):
        """A session that watches but has not acted lately still reads watching: the engine also asks the platform, as pattern.inbox does."""
        src = read(CAT / "kit/patterns/assist.js")
        self.assertIn("native = !f.length && canSend === 'available'", src)
        self.assertIn("watching: f.length > 0 || native", src)
        self.assertIn("if (pres.native) return w.native;", read(CAT / "kit/patterns/presence.js"))

    def test_assist_picker_skips_assist_ui(self):
        src = read(CAT / "kit/patterns/assist.js")
        self.assertEqual(src.count("[data-uncommentable], [data-assist-ui]"), 2)
        self.assertNotIn("downloads", src)
        self.assertIn("4000 bytes", src)

    def test_dataplane_guide_namespace(self):
        g = read(CAT / "kit/guides/artifact-dataplane.md")
        self.assertIn('"ns/users/{self}"', g)
        self.assertNotIn("data/users/{self}", g)


if __name__ == "__main__":
    unittest.main()
