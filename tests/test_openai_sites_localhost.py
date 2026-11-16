"""Real localhost HTTP with production Worker handler; local identity is simulated."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@unittest.skipUnless(shutil.which("node"), "node required")
class OpenAISitesLocalhost(unittest.TestCase):
    def test_localhost(self):
        probe = subprocess.run(["node", "-e", "require('node:sqlite')"], capture_output=True)
        if probe.returncode:
            self.skipTest("Node 22+ SQLite required")
        run = subprocess.run(["node", "tests/openai_sites_localhost.mjs"], cwd=ROOT,
                             capture_output=True, text=True, timeout=30)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
