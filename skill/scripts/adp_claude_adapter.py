"""Claude host adapter for the shared records shell (adp_bundle.py): prints ArtifactData calls and parses the result text the agent saves. No network.
Raw results are the shared envelope [{call: <the call descriptor printed>, result: <ArtifactData result text or error>}]; Claude needs no readback (a batch
result names every committed doc and its new version)."""
import json, re

HOST = 'claude'
LIMIT, BYTES = 50, 900_000      # ArtifactData batch: at most 50 writes and 1 MiB each


def read_calls(artifact, collections):
    return [{'tool': 'ArtifactData', 'args': {'action': 'list', 'url': artifact, 'collection': c, 'query': {'limit': 1000}}, 'collection': c} for c in collections]


def parse_reads(raw):
    """-> {docs: [{collection, id, data, revision}], covered: [collections read], complete, warnings}; `revision` is the doc's native version. A collection listing
    is the only way absence shows, so the core checks `covered`; more pages than one is incomplete."""
    docs, warn, covered = [], [], set()
    for r in raw:
        c, text = r['call']['collection'], r['result']; covered.add(c)
        for line in text.splitlines():
            if line.startswith('{"id":'):
                d = json.loads(line); docs.append({'collection': c, 'id': d['id'], 'data': d['data'], 'revision': d.get('version')})
        if 'next_cursor' in text: warn.append(f'{c}: more pages (next_cursor)')
    return {'docs': docs, 'covered': sorted(covered), 'complete': bool(raw) and not warn, 'warnings': warn or ([] if raw else ['no read results'])}


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
        text = r['result']; done = {f'{c}/{i}': int(v) for _, c, i, v in re.findall(r'- (\w+) "([^"]+)"/"([^"]+)" \(version (\d+)\)', text)}
        bad = re.search(r'db write failed[^\n]*|nothing was written[^\n]*', text)
        for k in r['call']['keys']:
            c, i = k.rsplit('/', 1)
            out.append({'collection': c, 'id': i, 'outcome': 'applied' if k in done else 'rejected' if bad else 'unknown', 'revision': done.get(k), 'error': bad.group(0) if bad and k not in done else None})
    return out
