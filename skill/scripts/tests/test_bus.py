"""Local socket integration; Codex queue is a captured executable, never a model call."""
import importlib.util
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'adp_bus.py'
spec = importlib.util.spec_from_file_location('adp_bus', SCRIPT)
bus = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bus)


class FormatTests(unittest.TestCase):
    def test_final_queue_arguments_and_self_suppression(self):
        with patch.object(bus.subprocess, 'run') as run:
            bus.queue_event(dict(type='receivers', id=1, receivers=['codex', 'claude']), 'chat', 'codex')
            bus.queue_event(dict(type='message', id=2, sender='mrv', text='raw $(text)'), 'chat', 'codex')
            bus.queue_event(dict(type='message', id=3, sender='codex', text='self'), 'chat', 'codex')
        self.assertEqual([c.args[0] for c in run.call_args_list], [
            ['codex', 'queue', '--thread', 'chat', '--message', '[ADP-BUS] ID: 1 : receivers :: codex | claude'],
            ['codex', 'queue', '--thread', 'chat', '--message', '[ADP-MSG] ID: 2 from mrv :: raw $(text)'],
        ])


@unittest.skipUnless(hasattr(__import__('socket'), 'AF_UNIX'), 'Unix sockets required')
class BusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir='/tmp')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = dict(os.environ, BUS_CAPTURE=str(self.root / 'queued'))
        self.server = self.spawn('--serve')
        self.assertIn('Listening on ', self.line(self.server))

    def stop(self, process):
        if process.poll() is None:
            process.terminate()
        process.wait(timeout=1)
        process.stdout.close()
        process.stderr.close()

    def spawn(self, *args):
        process = subprocess.Popen([sys.executable, '-I', str(SCRIPT), *args], cwd=self.root,
                                   env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
        self.addCleanup(self.stop, process)
        return process

    def line(self, process):
        self.assertTrue(select.select([process.stdout], [], [], 2)[0], 'No subscriber output')
        return process.stdout.readline().decode().strip()

    def run_bus(self, *args):
        result = subprocess.run([sys.executable, '-I', str(SCRIPT), *args], cwd=self.root,
                                env=self.env, capture_output=True, text=True, timeout=2)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def queued(self, count):
        end = time.monotonic() + 2
        while time.monotonic() < end:
            rows = (self.root / 'queued').read_text().splitlines() if (self.root / 'queued').exists() else []
            if len(rows) >= count:
                return [json.loads(row) for row in rows]
            time.sleep(.01)
        self.fail('Queue bridge did not deliver')

    def test_broadcast_presence_send_file_search_and_queue_bridge(self):
        executable = self.root / 'codex'
        executable.write_text('#!' + sys.executable + '\nimport json, os, sys\n'
                              'with open(os.environ["BUS_CAPTURE"], "a") as f: f.write(json.dumps(sys.argv[1:]) + "\\n")\n')
        executable.chmod(0o755)
        self.env['PATH'] = str(self.root) + os.pathsep + self.env['PATH']
        codex = self.spawn('--subscribe', 'codex', '--thread', 'chat')
        self.assertIn('receivers :: codex', self.line(codex))
        self.queued(1)
        claude = self.spawn('--subscribe', 'claude')
        self.assertIn('receivers :: codex | claude', self.line(claude))
        self.assertIn('receivers :: codex | claude', self.line(codex))
        self.queued(2)
        self.assertIn('from human :: hello $(literal)', self.run_bus('--name', 'human', '--send', 'hello $(literal)'))
        self.assertIn('hello $(literal)', self.line(codex))
        self.assertIn('hello $(literal)', self.line(claude))
        queued = self.queued(3)[-1]
        self.assertEqual(queued[:4], ['queue', '--thread', 'chat', '--message'])
        self.assertTrue(queued[-1].startswith('[ADP-MSG] ID: '))
        self.run_bus('--name', 'codex', '--send', 'own echo')
        self.assertIn('own echo', self.line(claude))
        (self.root / 'note').write_text('file café')
        self.run_bus('--name', 'human', '--send-file', 'note')
        self.assertIn('file café', self.line(codex))
        self.assertIn('file café', self.line(claude))
        self.assertFalse(any('own echo' in row[-1] for row in self.queued(4)))
        self.assertIn('file café', self.run_bus('--search', 'CAFÉ'))
        self.stop(claude)
        self.assertIn('receivers :: codex', self.line(codex))
        rows = [json.loads(line) for line in (self.root / '.adp/bus.jsonl').read_text().splitlines()]
        self.assertEqual([r['id'] for r in rows], list(range(1, len(rows) + 1)))

    def test_restart_persistence_and_normal_errors(self):
        self.run_bus('--send', 'retained')
        self.stop(self.server)
        self.server = self.spawn('--serve')
        self.assertIn('Listening on ', self.line(self.server))
        self.assertIn('retained', self.run_bus('--search', 'retained'))
        self.run_bus('--send', 'after restart')
        rows = [json.loads(line) for line in (self.root / '.adp/bus.jsonl').read_text().splitlines()]
        self.assertEqual([r['id'] for r in rows], [1, 2])
        connection = bus.Connection(self.root / '.adp/bus.sock')
        connection.request('POST', '/messages', '{bad json')
        self.assertEqual(connection.getresponse().status, 400)
        connection.close()
        with self.assertRaises(SystemExit), patch('sys.stderr'):
            bus.parse_args(['--send', 'hi', '--thread', 'chat'])


if __name__ == '__main__':
    unittest.main()
