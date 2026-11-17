"""Deterministic committed-source review reports. No network or inference."""
import argparse
from html import escape
import json
from pathlib import Path
import re
import subprocess
import sys


def git(repo, *args):
    result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True, timeout=20)
    if result.returncode:
        detail = result.stderr.decode('utf-8', errors='replace').strip()
        raise ValueError(detail or 'Git ' + args[0] + ' failed; reviewed commit must be an ancestor of the checked commit')
    return result.stdout.decode('utf-8', errors='surrogateescape')


def commit(repo, ref):
    return git(repo, 'rev-parse', '--verify', '--end-of-options', ref + '^{commit}').strip()


def source_path(value):
    path = value.get('path') if isinstance(value, dict) else value
    if not isinstance(path, str) or not path or path.startswith('/') or '\\' in path:
        raise ValueError('Sources must be repository-relative file paths or directories ending in /')
    if any(p in ('', '.', '..') for p in path.rstrip('/').split('/')) or any(ord(c) < 32 for c in path):
        raise ValueError('Unsafe source path: ' + repr(path))
    return path


def matches(path, sources):
    return any(path.startswith(s) if s.endswith('/') else path == s for s in sources)


def report(mapping, repo, head):
    if not isinstance(mapping, dict) or mapping.get('schema') != 'adp-source-map/1':
        raise ValueError('Expected schema adp-source-map/1')
    sections = mapping.get('sections')
    if not isinstance(sections, list) or not sections:
        raise ValueError('At least one section is required')
    tip = commit(repo, head)
    diffs, trees = {}, {}

    def snapshot(pin):
        if not isinstance(pin, str) or not re.fullmatch(r'[0-9a-fA-F]{40}|[0-9a-fA-F]{64}', pin):
            raise ValueError('sourceCommit must be a full immutable Git commit ID')
        base = commit(repo, pin)
        if base not in diffs:
            git(repo, 'merge-base', '--is-ancestor', base, tip)
            raw = git(repo, 'diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-status', '-z', base, tip, '--')
            fields = raw.rstrip('\0').split('\0') if raw else []
            diffs[base] = sorted(({'status': fields[i], 'path': fields[i + 1]}
                                  for i in range(0, len(fields), 2)), key=lambda c: c['path'])
            trees[base] = git(repo, 'ls-tree', '-r', '-z', '--name-only', base).rstrip('\0').split('\0')
        return base

    baseline = snapshot(mapping.get('sourceCommit'))
    results, ids, all_sources = [], set(), []
    for section in sections:
        if not isinstance(section, dict) or not isinstance(section.get('id'), str) or not section['id'].strip():
            raise ValueError('Every section needs a stable nonempty id')
        sid = section['id']
        if sid in ids:
            raise ValueError('Duplicate section id: ' + sid)
        ids.add(sid)
        values = section.get('sources')
        if not isinstance(values, list) or not values:
            raise ValueError('Section has no source mapping: ' + sid)
        sources = sorted(set(source_path(v) for v in values))
        base = snapshot(section.get('sourceCommit', baseline))
        missing = [s for s in sources if not any(matches(p, [s]) for p in trees[base])]
        if missing:
            raise ValueError('Sources absent at reviewed commit for ' + sid + ': ' + ', '.join(missing))
        changes = [c for c in diffs[base] if matches(c['path'], sources)]
        results.append({'id': sid, 'title': str(section.get('title') or sid), 'reviewedCommit': base,
                        'status': 'needs_review' if changes else 'current', 'sources': sources, 'changes': changes})
        all_sources.extend(sources)
    unmapped = [c for c in diffs[baseline] if not matches(c['path'], all_sources)]
    needs_review = any(s['status'] == 'needs_review' for s in results) or bool(unmapped)
    return {'schema': 'adp-source-drift/1', 'title': str(mapping.get('title') or 'Source review'),
            'status': 'needs_review' if needs_review else 'current', 'sourceCommit': baseline, 'head': tip,
            'basis': str(mapping.get('basis') or 'Declared source review map; deployment not verified'),
            'scope': 'Committed Git snapshots only; no worktree, remote fetch or deployed-state check',
            'sections': results, 'changedFiles': diffs[baseline], 'unmappedChanges': unmapped}


def markdown(data):
    def text(value):
        return escape(str(value)).replace('\n', ' ').replace('\r', ' ')

    def changes(rows):
        return [f"- <code>{text(c['status'])}</code> <code>{text(c['path'])}</code>" for c in rows]

    if data['status'] == 'error':
        return '# Source review: error\n\n' + text(data['error']) + '\n'
    affected = sum(s['status'] == 'needs_review' for s in data['sections'])
    lines = [f"# {text(data['title'])}", '',
             f"**{data['status']}** · {affected} sections need review · {len(data['unmappedChanges'])} unmapped changes", '',
             f"Reviewed baseline: `{data['sourceCommit']}` → checked commit: `{data['head']}`", '',
             text(data['basis']), '', text(data['scope']), '',
             'Changed sources require review; they do not prove the prose is incorrect.', '']
    for section in data['sections']:
        lines.extend([f"## {text(section['title'])} (<code>{text(section['id'])}</code>): {section['status']}", '',
                      f"Reviewed commit: `{section['reviewedCommit']}`", ''])
        lines.extend(changes(section['changes']) or ['No mapped source changes.'])
        lines.append('')
    lines.extend(['## Unmapped changed files', '', *changes(data['unmappedChanges'])])
    if not data['unmappedChanges']:
        lines.append('None.')
    lines.extend(['', 'Git types: A added, M modified, D deleted, T type changed. Renames appear as D + A.', ''])
    return '\n'.join(lines)


def main(argv):
    parser = argparse.ArgumentParser(prog='adp.py source-drift', description=__doc__)
    parser.add_argument('map', help='adp-source-map/1 JSON, or - for stdin')
    parser.add_argument('--repo', required=True, help='Local repository root; fetch separately if needed')
    parser.add_argument('--head', default='HEAD', help='Committed target ref (resolved to an immutable ID)')
    parser.add_argument('--format', choices=('json', 'markdown'), default='json')
    parser.add_argument('--out', type=Path, help='Also save the report; never advances review pins')
    parser.add_argument('--strict', action='store_true', help='Exit 2 when review or mapping work is needed')
    args = parser.parse_args(argv[1:])
    try:
        if args.out and args.map != '-' and args.out.resolve() == Path(args.map).resolve():
            raise ValueError('Report output must not overwrite the source map')
        if args.map == '-':
            mapping = json.load(sys.stdin)
        else:
            mapping = json.loads(Path(args.map).read_text(encoding='utf-8'))
        # Paths in the map are relative to the repository root, never a cwd prefix.
        root = Path(git(args.repo, 'rev-parse', '--show-toplevel').strip())
        data = report(mapping, root, args.head)
        code = 2 if args.strict and data['status'] == 'needs_review' else 0
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        data, code = {'schema': 'adp-source-drift/1', 'status': 'error', 'error': str(error)}, 1
    output = markdown(data) if args.format == 'markdown' else json.dumps(data, indent=2) + '\n'
    if args.out and not (args.map != '-' and args.out.resolve() == Path(args.map).resolve()):
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(output, encoding='utf-8')
    print(output, end='')
    return code
