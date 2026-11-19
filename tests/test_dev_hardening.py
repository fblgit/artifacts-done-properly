"""The dev emulator (adp.py dev serve) is a local server a page talks to; it must not read or write outside its folders on a request's say-so,
and it must not put a request-derived string in a response header unchecked."""
import http.client
import http.server
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'plugins', 'artifacts-done-properly', 'skills', 'adp', 'scripts'))
import adp_dev  # noqa: E402


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = os.path.realpath(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.art, self.state, self.outside = (os.path.join(self.tmp, n) for n in ('art', 'state', 'outside'))
        for d in (self.art, self.state, self.outside):
            os.makedirs(d)


class StoreTests(Base):
    def batch(self, store, **w):
        return store.apply([[{'op': 'set', 'collection': 'c', 'doc_id': 'd', **w}]])[0]

    def write(self, name, text):
        p = os.path.join(self.art, name)
        with open(p, 'w') as f:
            f.write(text)
        return p

    def test_a_file_path_inside_the_artifact_or_the_state_is_read(self):
        store = adp_dev.Store(self.state, roots=(self.art, self.state))
        r = self.batch(store, file_path=self.write('doc.json', '{"a": 1}'))
        self.assertTrue(r['ok'], r)
        self.assertEqual(store.all()['c/d']['data'], {'a': 1})

    def test_a_file_path_outside_is_refused_and_nothing_is_written(self):
        secret = os.path.join(self.outside, 'secret.json')
        with open(secret, 'w') as f:
            f.write('{"token": "x"}')
        store = adp_dev.Store(self.state, roots=(self.art, self.state))
        for p in (secret, os.path.join(self.art, '..', 'outside', 'secret.json')):
            r = self.batch(store, file_path=p)
            self.assertFalse(r['ok'], p)
            self.assertIn('file_path', json.dumps(r))
        self.assertEqual(store.all(), {})

    def test_a_symlink_out_of_the_artifact_does_not_count_as_inside(self):
        secret = os.path.join(self.outside, 'secret.json')
        with open(secret, 'w') as f:
            f.write('{"token": "x"}')
        os.symlink(secret, os.path.join(self.art, 'link.json'))
        store = adp_dev.Store(self.state, roots=(self.art, self.state))
        self.assertFalse(self.batch(store, file_path=os.path.join(self.art, 'link.json'))['ok'])

    def test_no_roots_means_no_file_reads(self):
        self.assertFalse(self.batch(adp_dev.Store(self.state), file_path=self.write('doc.json', '{}'))['ok'])

    def test_a_collection_file_that_leaves_the_db_folder_is_refused(self):
        target = os.path.join(self.outside, 'target.json')
        with open(target, 'w') as f:
            f.write('{}')
        store = adp_dev.Store(self.state, roots=(self.art,))
        os.symlink(target, os.path.join(store.db, 'evil.json'))      # a collection whose file is a link out of db/
        self.assertRaises(ValueError, store.file, 'evil')
        r = store.write('set', 'evil/x', {'v': 1})
        self.assertEqual(r['error']['code'] if 'error' in r else r.get('code'), 'invalid_argument')
        with open(target) as f:
            self.assertEqual(f.read(), '{}')
        self.assertFalse(self.batch(store, collection='evil', data={'v': 1})['ok'])


class InlineTests(Base):
    def test_dev_send_reads_the_files_itself_wherever_they_are(self):
        p = os.path.join(self.outside, 'w.json')      # --out may put them anywhere: the client reads them, the server never sees the path
        with open(p, 'w') as f:
            f.write('{"a": 1}')
        w = {'op': 'set', 'collection': 'c', 'doc_id': 'd', 'file_path': p}
        for shape, get in (([[w]], lambda x: x[0][0]), ({'batches': [[w]]}, lambda x: x['batches'][0][0]), ({'writes': [w]}, lambda x: x['writes'][0])):
            out = get(adp_dev.inline(shape))
            self.assertEqual(out['data'], {'a': 1})
            self.assertNotIn('file_path', out)
        kept = {**w, 'data': {'b': 2}}
        self.assertEqual(adp_dev.inline([[kept]])[0][0]['data'], {'b': 2})      # a write that carries its data is left alone


class HeaderTests(Base):
    def test_a_content_type_with_a_line_break_never_reaches_the_response(self):
        with open(os.path.join(self.art, 'x.html'), 'w') as f:
            f.write('hi')
        srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), adp_dev.handler(self.art, self.state, 'u', False))
        self.addCleanup(srv.server_close)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.shutdown)
        with mock.patch.object(adp_dev.mimetypes, 'guess_type', return_value=('text/plain\r\nX-Injected: 1', None)):
            c = http.client.HTTPConnection('127.0.0.1', srv.server_address[1], timeout=5)
            c.request('GET', '/x.html')
            r = c.getresponse()
            r.read()
        self.assertIsNone(r.getheader('X-Injected'))
        self.assertNotIn('\n', r.getheader('content-type') or '')

    def test_a_normal_type_is_unchanged(self):
        with open(os.path.join(self.art, 'a.css'), 'w') as f:
            f.write('a{}')
        srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), adp_dev.handler(self.art, self.state, 'u', False))
        self.addCleanup(srv.server_close)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.shutdown)
        c = http.client.HTTPConnection('127.0.0.1', srv.server_address[1], timeout=5)
        c.request('GET', '/a.css')
        r = c.getresponse()
        r.read()
        self.assertEqual(r.getheader('content-type'), 'text/css; charset=utf-8')


if __name__ == '__main__':
    unittest.main()
