"""`adp.py files --host single` / `unpack`: one self-contained index.html that unpacks byte for byte."""
import json, os, re, subprocess, sys, tempfile, unittest

ADP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'skill', 'scripts', 'adp.py')
PAGE = ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>T</title>'
        '<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet"><link rel="stylesheet" href="s/a.css?v=1">'
        '<script defer src="a.js"></script><script src="https://cdnjs.cloudflare.com/x.js"></script></head>'
        '<body><p>hi</p><script src="early.js"></script></body></html>')
FILES = {'index.html': PAGE, 'a.js': 'var a=1;', 'early.js': 'var e="</script><!--";', 's/a.css': 'p{color:red}\r\n', 'd.json': '{"x":"é"}'}


class Pack(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory(); self.addCleanup(self.t.cleanup)
        self.src = os.path.join(self.t.name, 'src')
        for p, v in {**FILES, 'img.bin': b'\x00\xff\r\n'}.items():
            os.makedirs(os.path.dirname(os.path.join(self.src, p)), exist_ok=True)
            with open(os.path.join(self.src, p), 'wb') as f: f.write(v if isinstance(v, bytes) else v.encode())

    def run_adp(self, *a):
        return subprocess.run([sys.executable, '-I', ADP, *a], capture_output=True, text=True)

    def pack(self, *flags):
        out = os.path.join(self.t.name, 'one.html')
        r = self.run_adp('files', self.src, '--host', 'single', '--out', out, *flags); self.assertEqual(r.returncode, 0, r.stderr)
        with open(out, encoding='utf-8', newline='') as f: return out, f.read(), json.loads(r.stdout)

    def test_round_trip_is_byte_identical(self):
        out, _, info = self.pack(); dest = os.path.join(self.t.name, 'back')
        self.assertEqual(info['files'], 6)
        r = self.run_adp('unpack', out, dest); self.assertEqual(r.returncode, 0, r.stderr)
        for root, _, names in os.walk(self.src):
            for n in names:
                p = os.path.join(root, n); q = os.path.join(dest, os.path.relpath(p, self.src))
                with open(p, 'rb') as a, open(q, 'rb') as b: self.assertEqual(a.read(), b.read(), n)

    def test_local_references_become_shim_calls_and_the_rest_stays(self):
        _, page, _ = self.pack()
        self.assertEqual(page.count('src="a.js"') + page.count('href="s/a.css'), 0)
        self.assertIn('ADPPACK.css("s/a.css")', page)
        self.assertLess(page.index('ADPPACK.js("early.js")'), page.index('ADPPACK.js("a.js")'))      # defer moved after the body
        self.assertGreater(page.index('ADPPACK.js("a.js")'), page.index('<p>hi</p>'))
        self.assertIn('fonts.googleapis.com', page); self.assertIn('cdnjs.cloudflare.com/x.js', page)
        self.assertEqual(len(re.findall(r'<meta charset', page)), 1)

    def test_fragment_has_no_document_tags_and_title_first(self):
        _, page, _ = self.pack('--fragment')
        self.assertTrue(page.startswith('<title>T</title>'))
        self.assertFalse(re.search(r'<!doctype|<html|<head|<body', page, re.I))

    def test_a_page_that_is_already_a_fragment_packs_as_all_body(self):
        with open(os.path.join(self.src, 'index.html'), 'w') as f: f.write('<p>hi</p><script src="a.js"></script>')
        _, page, _ = self.pack('--fragment')
        self.assertIn('ADPPACK.js("a.js")', page); self.assertIn('<p>hi</p>', page)

    def test_unpack_reads_a_catalog_pack_too(self):
        pack = os.path.join(self.t.name, 'catalog-pack-01.json'); dest = os.path.join(self.t.name, 'cat')
        with open(pack, 'w', encoding='utf-8') as f: json.dump({'schema': 'adp-catalog-pack/1', 'files': {'kit/a.js': 'A', '../evil': 'x'}}, f)
        self.assertEqual(self.run_adp('unpack', pack, dest).returncode, 0)
        with open(os.path.join(dest, 'kit', 'a.js')) as f: self.assertEqual(f.read(), 'A')
        self.assertFalse(os.path.exists(os.path.join(self.t.name, 'evil')))

    def test_unpack_refuses_tampering_and_a_used_folder(self):
        out, page, _ = self.pack()
        bad = os.path.join(self.t.name, 'bad.html')
        with open(bad, 'w', encoding='utf-8') as f: f.write(page.replace('var a=1;', 'var a=2;'))
        r = self.run_adp('unpack', bad, os.path.join(self.t.name, 'x')); self.assertEqual(r.returncode, 1); self.assertIn('Checksum', r.stderr)
        self.assertEqual(self.run_adp('unpack', out, self.src).returncode, 1)


if __name__ == '__main__':
    unittest.main()
