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

    def test_seven_columns_fit_a_1190_px_map_and_never_overlap(self):
        f = self.o['fit']          # the real Hue map: 7 columns in about 1190 px overflowed and hid its last column (seen in a real browser)
        self.assertTrue(f['fits'], f); self.assertEqual(f['columns'], 7); self.assertGreaterEqual(f['nodeW'], 120); self.assertTrue(f['noOverlap'])

    def test_the_nearest_owned_ancestor_is_the_owner(self):
        a, b, c, d = self.o['owner']
        self.assertEqual((a['id'], a['via'], a['value']), ('pk', 'class', 'pk-wheel'))      # found two levels up
        self.assertEqual((b['id'], b['via'], b['value']), ('dl', 'id', 'mark'))
        self.assertIsNone(c['id']); self.assertIsNone(d['id'])

    def test_assigned_classes_join_the_candidate_and_make_it_pickable(self):
        a = self.o['assigned']
        self.assertEqual(a['classes'], ['x', 'y']); self.assertEqual(a['ids'], ['mark']); self.assertEqual(a['owner'], 'A'); self.assertEqual(a['plain'], ['x'])

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

    def test_a_button_sized_fragment_is_not_passed_off_as_a_picture_of_the_component(self):
        f = self.o['snapFragment']      # the panel a person met: "A still picture of it as it is on screen now (116 x 40 px)"
        self.assertIn('Only a small fragment of it is on screen (116 × 40 px)', f['text']); self.assertIn('not a preview of the component', f['text']); self.assertEqual(f['tone'], 'warn')
        self.assertNotIn('A still picture of it', f['text'])

    def test_an_svg_element_can_be_marked_pictured_and_unmarked(self):
        n = self.o['nowOnScreen']
        self.assertTrue(n['isSvg']); self.assertEqual(n['focus'], ['kit-ai-focus']); self.assertTrue(n['srcdoc']); self.assertTrue(n['svgPicture'])
        self.assertEqual(self.o['svgUnmarked'], [])                                  # selecting another candidate took the marks off the SVG
        self.assertEqual(self.o['errors'], [])                                        # nothing was thrown anywhere, which is what broke the first release

    def test_a_click_on_a_block_nobody_owns_offers_to_assign_it(self):
        u = self.o['unowned']
        self.assertIsNone(u['pick']['id']); self.assertEqual(u['pick']['classes'], ['z']); self.assertEqual(u['pick']['label'], 'div.z')      # still reported, with what it is
        self.assertEqual(u['off'], 'false')                                                                                                 # the picker turned itself off
        self.assertEqual(u['head'], 'Nobody owns div.z'); self.assertTrue(u['hasAssign']); self.assertEqual(u['options'], 7)
        self.assertEqual(self.o['heldAfterDelay'], 'Nobody owns div.z')                                                                     # a redraw does not wipe the panel
        self.assertEqual(self.o['assigned'], [{'id': 'W', 'classes': ['z'], 'ids': []}]); self.assertIn('Assigned to W', self.o['assignSaid'])
        self.assertEqual((self.o['afterAssignPick']['id'], self.o['afterAssignPick']['via'], self.o['afterAssignPick']['value']), ('W', 'class', 'z'))
        b = self.o['bare']; self.assertFalse(b['assign']); self.assertIn('no class or id', b['text']); self.assertIsNone(b['id'])

    def test_the_picker_names_the_owner_and_a_click_selects_it(self):
        self.assertEqual(self.o['hover'], '<span> → P (class pk-in)')
        p = self.o['picks']; self.assertEqual(len(p), 1)
        self.assertEqual({k: p[0][k] for k in ('tag', 'id', 'via', 'value', 'label')}, {'tag': 'span', 'id': 'P', 'via': 'class', 'value': 'pk-in', 'label': 'span.pk-in'}); self.assertEqual(self.o['pickerOff'], 'false')


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
        self.assertIn('ns/shared/packs/c.c', s['text']); self.assertIn('state.items', s['text']); self.assertIn('make it generic', s['text'])
        self.assertEqual(o['items'], [['c.b', 'working'], ['c.c', 'working']])

    def test_a_failed_save_says_so(self):
        f = self.o['failed']; self.assertEqual((f['tone'], f['status']), ('danger', 'Not saved: permission-denied. Reload and try again.'))

    def test_a_viewer_can_look_and_not_change(self):
        v = self.o['viewer']; self.assertTrue(v['disabled']); self.assertIn('You can look but not change', v['status'])

    def test_selecting_never_throws_on_a_database_path(self):
        # the stand-in refuses a path with an odd number of parts, like the real handle; the first release built ns/shared/adopt/packs/<id> and every select threw
        self.assertTrue(self.o['selectDidNotThrow']); self.assertEqual(self.o['refreshed']['pressed'], 'c.b')

    def test_a_preview_written_by_claude_is_shown_and_arrives_live(self):
        p = self.o['previewShown']
        self.assertTrue(p['frame']); self.assertIn('built for c.c', p['srcdoc']); self.assertEqual(p['sandbox'], 'allow-scripts allow-same-origin')
        self.assertEqual(self.o['arrives'], '<p>now there is one</p>')            # written after the candidate was selected, shown without a reload

    def test_the_stored_preview_loads_after_switching_candidates_on_a_page_that_draws_svg(self):
        o = self.o       # the report from the user: previews only came back after regenerating, because select threw on SVG and never asked for the stored preview
        self.assertEqual(o['svgGlueErrors'], []); self.assertFalse(o['afterSwitch']);          # c.a has none, so no frame while it is selected
        self.assertTrue(o['previewShown']['frame']); self.assertIn('built for c.c', o['previewShown']['srcdoc'])      # and c.c's returns by itself

    def test_a_blank_or_failing_preview_says_so(self):
        o = self.o
        self.assertEqual(o['capError'], 'The preview reported a problem: boom @picker.js:9')
        self.assertEqual(o['capBlank'], 'The preview page loaded but drew nothing.')
        self.assertTrue(o['capOk'].startswith('A preview page built for this component'))

    def test_how_each_preview_loaded_is_kept_on_the_server_for_a_session_to_read(self):
        o = self.o
        self.assertEqual(o['diagSeq'], ['error', 'blank', 'ok'])                    # one entry per candidate, the latest outcome
        self.assertEqual(o['diag'], [['c.c', 'ok', [], 1]])

    def test_without_a_preview_the_button_asks_for_one_with_the_files_in_order(self):
        o = self.o
        self.assertEqual(o['noPreview'], {'frame': False, 'button': 'Ask Claude to build a preview'})
        r = o['buildRequest'][0]; self.assertEqual((r['id'], r['label']), ('adopt.inspect', 'Preview of c.b'))
        self.assertIn('subject/c.a.js subject/c.b.js', r['text'])                  # what it needs first, then the candidate
        self.assertIn('ns/shared/previews/c.b', r['text']); self.assertLess(len(r['text'].encode()), 3500)      # the comment that wakes a session is limited
        self.assertEqual(o['buttonAfter'], 'Asked. The preview appears here when Claude has written it.')

    def test_a_block_nobody_owns_is_assigned_kept_on_the_server_and_selects_next_time(self):
        o = self.o
        self.assertEqual(o['unownedPanel']['head'], 'Nobody owns div.zz'); self.assertTrue(o['unownedPanel']['assign']); self.assertIn('Nobody owns div.zz', o['unownedPanel']['note'])
        self.assertEqual(o['assignedState']['classes'], ['zz'])                       # on the server, on c.a's entry
        self.assertEqual(o['afterAssign']['selected'], 'c.a'); self.assertIn('Assigned zz to c.a', o['afterAssign']['said']); self.assertTrue(o['afterAssign']['panelGone'])      # the candidate is selected and its own preview takes the panel
        self.assertEqual(o['clickNowSelects'], 'c.a'); self.assertEqual(o['noErrorsAfterAssign'], [])

    def test_ids_with_dots_are_list_entries_not_keys(self):
        self.assertTrue(self.o['noDotKeys'])


if __name__ == '__main__':
    unittest.main()
