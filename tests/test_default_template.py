import json
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = os.path.join(ROOT, 'skill', 'templates')


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


class DefaultTemplate(unittest.TestCase):
    def setUp(self):
        self.t = load(os.path.join(TPL, 'default', 'template.json'))
        self.cat = {e['id']: e for e in load(os.path.join(ROOT, 'skill', 'catalog', 'catalog.json'))['entries']}

    def test_name_and_base(self):
        self.assertEqual(self.t['name'], 'default')
        self.assertTrue(os.path.isfile(os.path.join(TPL, self.t['base'], 'template.json')))

    def test_take_exists_no_duplicates(self):
        take = self.t['take']
        self.assertEqual(len(take), len(set(take)))
        self.assertEqual([i for i in take if i not in self.cat], [])

    def test_capabilities_equal_assistant(self):
        self.assertEqual(self.t['capabilities'], load(os.path.join(TPL, 'assistant', 'template.json'))['capabilities'])

    def test_assistant_take_leads(self):
        a = load(os.path.join(TPL, 'assistant', 'template.json'))['take']
        self.assertEqual(self.t['take'][:len(a)], a)

    def test_all_themes(self):
        themes = {i for i in self.cat if i.startswith('theme.')}
        self.assertEqual(len(themes), 13)
        self.assertLessEqual(themes, set(self.t['take']))

    def test_requires_closure_in_catalog(self):
        seen, todo = set(), list(self.t['take'])
        while todo:
            i = todo.pop()
            if i in seen:
                continue
            seen.add(i)
            self.assertIn(i, self.cat)
            todo += self.cat[i].get('requires') or []


if __name__ == '__main__':
    unittest.main()
