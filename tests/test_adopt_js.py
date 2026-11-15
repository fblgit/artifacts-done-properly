"""Runs the DOM-free adopt engine (kit/adopt.js) under Node and checks what the board draws from it: which paths light, what is needed, what conflicts,
that the layout fills a width, and which candidate owns a clicked element. Skipped when Node is not installed (CI passes --require-node to the roundtrip)."""
import glob, json, os, shutil, subprocess, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def node():
    found = shutil.which('node') or next(iter(sorted(glob.glob(os.path.expanduser('~/.nvm/versions/node/*/bin/node')))), None)
    return found


@unittest.skipUnless(node(), 'node is not installed')
class Engine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = subprocess.run([node(), os.path.join(HERE, 'adopt_engine.js'), os.path.join(ROOT, 'skill', 'catalog', 'kit', 'adopt.js')], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        cls.o = json.loads(r.stdout)

    def test_adopting_requires_what_it_needs_and_flags_a_discarded_one(self):
        c = self.o['closure']
        self.assertEqual(c['on'], ['A', 'B', 'C'])                      # D and E are not on an adopted path
        self.assertEqual(c['required'], {'B': ['A'], 'C': ['A']})       # A is adopted; B and C come with it
        self.assertEqual(c['conflicts'], ['C'])                         # C is needed and discarded

    def test_edges_light_green_conflict_red_and_discarded_grey(self):
        e = self.o['edges']
        self.assertEqual((e['BA'], e['CB'], e['DE'], e['none'], e['missing']), ('on', 'conflict', 'off', '', ''))

    def test_states_counts_and_merge(self):
        self.assertTrue(self.o['adopted'])
        self.assertEqual(self.o['counts'], {'all': 5, 'detected': 2, 'selected': 1, 'working': 0, 'preview': 0, 'ready': 0, 'discarded': 2})
        self.assertEqual(self.o['merge'], 'ready|detected')              # a state that is not one of the six is ignored

    def test_layout_layers_fill_the_width_and_a_cycle_ends(self):
        L = self.o['layout']
        self.assertEqual(L['layers'], [0, 1, 2, 2])
        self.assertGreater(L['wideRight'], L['narrowRight'])            # the columns spread
        self.assertTrue(L['wideFits']); self.assertTrue(L['widerNodes']); self.assertEqual(L['edges'], 3)
        self.assertTrue(self.o['cycleEnds'])

    def test_the_nearest_owned_ancestor_is_the_owner(self):
        a, b, c, d = self.o['owner']
        self.assertEqual((a['id'], a['via'], a['value']), ('pk', 'class', 'pk-wheel'))      # found two levels up
        self.assertEqual((b['id'], b['via'], b['value']), ('dl', 'id', 'mark'))
        self.assertIsNone(c['id']); self.assertIsNone(d['id'])

    def test_pack_verification_reports_a_mismatch(self):
        self.assertEqual(self.o['verify'], ['sha256 mismatch b', 'size mismatch b'])


def jsdom_dir():
    """A folder holding node_modules/jsdom: ADOPT_JSDOM_DIR, else the one next to the job's scratch files. jsdom is not a dependency of the repo."""
    for d in (os.environ.get('ADOPT_JSDOM_DIR'), os.path.join(os.environ.get('CLAUDE_JOB_DIR', ''), 'tmp', 'jsd')):
        if d and os.path.isdir(os.path.join(d, 'node_modules', 'jsdom')): return d
    return None


@unittest.skipUnless(node() and jsdom_dir(), 'node with jsdom (ADOPT_JSDOM_DIR) is not available')
class Dom(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        r = subprocess.run([node(), os.path.join(HERE, 'adopt_dom.js'), jsdom_dir(), os.path.join(ROOT, 'skill', 'catalog', 'kit')], capture_output=True, text=True, timeout=60)
        assert r.returncode == 0, r.stdout + r.stderr
        cls.o = json.loads(r.stdout)

    def test_every_state_reads_on_its_node(self):
        n = self.o['nodes']
        self.assertEqual({k: v['state'] for k, v in n.items()}, {'P': 'selected', 'B': 'detected', 'C': 'discarded', 'W': 'working', 'R': 'ready', 'D': 'discarded', 'N': 'detected'})
        self.assertTrue(n['W']['dot']); self.assertFalse(n['P']['dot'])                        # working pulses
        self.assertTrue(n['R']['name'].startswith('✓ '))                                       # ready is marked in words as well as colour
        self.assertEqual((n['B']['need'], n['C']['need'], n['P']['need']), ('yes', 'conflict', ''))
        self.assertIn('needed by 1', n['B']['meta']); self.assertEqual(n['P']['pressed'], 'true')

    def test_adopted_paths_light_and_a_discarded_need_is_a_conflict(self):
        self.assertEqual(self.o['edges'], ['conflict', 'on sel'])        # B to P is lit (and the selected one's), C to B is the conflict
        self.assertEqual(self.o['markers'], ['kit-ab-arrow', 'kit-ab-arrow-conflict', 'kit-ab-arrow-on'])
        self.assertEqual(self.o['legend'], ['on', 'need', 'bad', 'off'])

    def test_the_panel_says_what_adopting_requires_and_offers_the_moves(self):
        o = self.o
        self.assertEqual(o['sideP']['buttons'], ['Work on it', 'Discard']); self.assertEqual(o['moves'], [['P', 'discarded']])
        self.assertIn('Needed by P', o['needNoteB']); self.assertIn('Discarded, but P needs it', o['needNoteC']); self.assertTrue(o['conflictBad'])
        self.assertEqual(o['download'], 'Download pattern.r.adp.json')
        self.assertEqual(o['clickSelected'], ['W']); self.assertEqual(o['filtered'], ['W'])
        self.assertEqual(o['status'], {'text': 'Saved to the server at 14:02.', 'tone': 'ok'})

    def test_the_frame_is_painted_by_state(self):
        p = self.o['paint']
        self.assertEqual(p['wheel'], ['kit-ai-focus', 'kit-ai-st-selected']); self.assertEqual(p['working'], ['kit-ai-st-working'])
        self.assertEqual(p['ready'], ['kit-ai-st-ready']); self.assertEqual(p['discarded'], ['kit-ai-st-discarded']); self.assertEqual(p['other'], [])
        self.assertEqual(self.o['afterDiscard'], ['kit-ai-focus', 'kit-ai-st-discarded'])       # a new state repaints without a reload

    def test_the_selected_component_shows_as_a_picture_with_the_frames_styles(self):
        s = self.o['snapP']; self.assertFalse(s['hidden']); self.assertIn('would become pattern.p', s['head'])
        self.assertIn('href="styles/picker.css"', s['srcdoc']); self.assertIn('.pk-wheel{color:red}', s['srcdoc']); self.assertIn('class="pk-in"', s['srcdoc'])
        for leak in ('kit-ai-st-', 'kit-ai-focus', 'kit-ai-hover', '@keyframes'): self.assertNotIn(leak, s['srcdoc'])      # none of the inspector's own marks or styles leak into the picture
        self.assertIn('No visual: B draws nothing', self.o['snapLogic']); self.assertIn('Not on screen', self.o['snapAbsent'])
        self.assertTrue(self.o['snapAgain']); self.assertTrue(self.o['nowOnScreen']['srcdoc'])    # it follows the frame when the view changes

    def test_the_picker_names_the_owner_and_a_click_selects_it(self):
        self.assertEqual(self.o['hover'], '<span> → P (class pk-in)')
        self.assertEqual(self.o['picks'], [{'tag': 'span', 'id': 'P', 'via': 'class', 'value': 'pk-in'}]); self.assertEqual(self.o['pickerOff'], 'false')


@unittest.skipUnless(node() and jsdom_dir(), 'node with jsdom (ADOPT_JSDOM_DIR) is not available')
class Glue(unittest.TestCase):
    """The adopter's parts/adopt.js against an in-memory database: what is kept on the server, and what a refresh brings back."""
    @classmethod
    def setUpClass(cls):
        glue = os.path.join(ROOT, 'skill', 'templates', 'adopter', 'parts', 'adopt.js.txt')
        r = subprocess.run([node(), os.path.join(HERE, 'adopt_glue.js'), jsdom_dir(), os.path.join(ROOT, 'skill', 'catalog', 'kit'), glue], capture_output=True, text=True, timeout=60)
        assert r.returncode == 0, r.stdout + r.stderr
        cls.o = json.loads(r.stdout)

    def test_a_first_visit_has_nothing_saved(self):
        self.assertEqual(self.o['first']['status'], 'Nothing saved on the server yet.')
        self.assertEqual(set(self.o['first']['states'].values()), {'detected'})

    def test_a_decision_and_the_selection_reach_the_server(self):
        o = self.o
        self.assertEqual(o['afterSelect']['states']['c.b'], 'selected'); self.assertTrue(o['afterSelect']['status'].startswith('Saved to the server at'))
        self.assertEqual([(x['id'], x['state']) for x in o['dbState']['items']], [('c.b', 'selected')]); self.assertEqual(o['dbView'], 'c.b')

    def test_a_refresh_forgets_nothing(self):
        r = self.o['refreshed']
        self.assertEqual(r['states'], {'c.a': 'detected', 'c.b': 'working', 'c.c': 'detected'})      # the state it was left in, not the analysis' default
        self.assertEqual(r['pressed'], 'c.b')                                                         # and the candidate that was selected
        self.assertEqual(r['status'], 'Restored 1 decision from the server.')

    def test_working_sends_a_request_and_records_it(self):
        o = self.o; s = o['sent'][0]
        self.assertEqual((s['lane'], s['scope']['id'], s['scope']['label']), ('task', 'adopt.board', 'Candidate c.c'))
        self.assertIn('ns/shared/adopt/packs/c.c', s['text']); self.assertIn('state.items', s['text']); self.assertIn('make it generic', s['text'])
        self.assertEqual(o['items'], [['c.b', 'working'], ['c.c', 'working']])

    def test_a_failed_save_says_so(self):
        f = self.o['failed']; self.assertEqual((f['tone'], f['status']), ('danger', 'Not saved: permission-denied. Reload and try again.'))

    def test_a_viewer_can_look_and_not_change(self):
        v = self.o['viewer']; self.assertTrue(v['disabled']); self.assertIn('You can look but not change', v['status'])

    def test_ids_with_dots_are_list_entries_not_keys(self):
        self.assertTrue(self.o['noDotKeys'])


if __name__ == '__main__':
    unittest.main()
