"""Exercise the real Worker SQL via SQLite; not a hosted Sites certification."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@unittest.skipUnless(shutil.which("node"), "node required")
class OpenAISitesServer(unittest.TestCase):
    def test_sql_transport(self):
        probe = subprocess.run(["node", "-e", "require('node:sqlite')"], capture_output=True)
        if probe.returncode:
            self.skipTest("Node 22+ SQLite required for real SQL transport tests")
        run = subprocess.run(["node", "tests/openai_sites_server.mjs"], cwd=ROOT,
                             capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
