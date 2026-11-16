"""Claude host adapter for the shared records shell (adp_bundle.py): prints ArtifactData calls and parses the result text the agent saves. No network.
Raw reads: [{"collection": c, "text": <ArtifactData list result>}]. Raw receipts: [{"keys": [...], "text": <ArtifactData batch result or error>}]."""
import json, re

HOST = 'claude'
LIMIT, BYTES = 50, 900_000      # ArtifactData batch: at most 50 writes and 1 MiB each


def read_calls(artifact, collections):
    return [{'tool': 'ArtifactData', 'args': {'action': 'list', 'url': artifact, 'collection': c, 'query': {'limit': 1000}}, 'collection': c} for c in collections]


def parse_reads(raw):
    """-> {docs: [{collection, id, data, revision}], complete, warnings}; `revision` is the doc's native version. More pages than one is incomplete."""
    docs, warn = [], []
    for r in raw:
        for line in r['text'].splitlines():
            if line.startswith('{"id":'):
                d = json.loads(line); docs.append({'collection': r['collection'], 'id': d['id'], 'data': d['data'], 'revision': d.get('version')})
        if 'next_cursor' in r['text']: warn.append(f"{r['collection']}: more pages (next_cursor)")
    return {'docs': docs, 'complete': not warn, 'warnings': warn}


def write_calls(artifact, ops):
    """create = set with no pin (the tool refuses a set over an existing doc); replace = set pinned to the fresh version. Chunked to one atomic batch each."""
    calls, cur, size = [], [], 0
    for o in ops:
        w = {'op': 'set', 'collection': o['collection'], 'doc_id': o['id'], 'data': o['data']}
        if o['op'] == 'replace': w['if_version'] = o['guard']
        n = len(json.dumps(w, ensure_ascii=False).encode())
        if cur and (len(cur) == LIMIT or size + n > BYTES): calls.append(cur); cur, size = [], 0
        cur.append(w); size += n
    if cur: calls.append(cur)
    return [{'tool': 'ArtifactData', 'args': {'action': 'batch', 'url': artifact, 'writes': c}, 'keys': [f"{w['collection']}/{w['doc_id']}" for w in c], 'atomic': True} for c in calls]


def parse_receipt(raw):
    """A batch is all or nothing: its lines name what committed (with the new version); an error says nothing was written; anything else is unknown."""
    out = []
    for r in raw:
        done = {f'{c}/{i}': int(v) for _, c, i, v in re.findall(r'- (\w+) "([^"]+)"/"([^"]+)" \(version (\d+)\)', r['text'])}
        bad = re.search(r'db write failed[^\n]*|nothing was written[^\n]*', r['text'])
        for k in r['keys']:
            c, i = k.rsplit('/', 1)
            out.append({'collection': c, 'id': i, 'outcome': 'applied' if k in done else 'rejected' if bad else 'unknown', 'revision': done.get(k), 'error': bad.group(0) if bad and k not in done else None})
    return out
