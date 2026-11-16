"""Sites record adapter for the shared ADP shell, using existing Site MCP tools.

Calls are executed by the authorized agent. A tool response is not a verified
import until a fresh authoritative read matches both data and native revision.
"""
import copy
import json
import re

HOST = 'sites'


def location(artifact, path):
    if not isinstance(artifact, str) or not re.fullmatch(r'[A-Za-z0-9_-]+', artifact):
        raise ValueError('Invalid Sites artifact')
    if not isinstance(path, str) or len(path) > 512 or not re.fullmatch(r'[A-Za-z0-9_.~:@+-]+(?:/[A-Za-z0-9_.~:@+-]+)*', path):
        raise ValueError('Invalid Sites record path')
    parts = path.split('/')
    if len(parts) % 2 or any(p in ('.', '..') for p in parts):
        raise ValueError('Sites record path needs an even number of segments')
    return {'artifact': artifact, 'path': path}


def read_call(artifact, path):
    return {'name': 'adp_read', 'arguments': location(artifact, path)}


def write_call(artifact, path, data, target):
    """Use the freshly read destination snapshot, including tombstone revisions."""
    revision = target.get('revision') if isinstance(target, dict) else None
    if type(revision) is not int or revision < 0 or revision > 9007199254740990:
        raise ValueError('A fresh Sites target revision is required')
    if type(target.get('exists')) is not bool or not isinstance(data, dict):
        raise ValueError('Target existence and a record object are required')
    return {'name': 'adp_write', 'arguments': {
        **location(artifact, path), 'mode': 'set',
        'data': copy.deepcopy(data), 'expectedRevision': revision}}


def decode(reply):
    """Accept native tool content or decoded JSON; retain errors for reconciliation."""
    if not isinstance(reply, dict):
        return {}
    if isinstance(reply.get('result'), dict):
        reply = reply['result']
    if 'content' not in reply:
        return reply
    try:
        text = next(c['text'] for c in reply['content'] if c.get('type') == 'text')
        value = json.loads(text)
        if not isinstance(value, dict):
            return {}
        if reply.get('isError'):
            value.setdefault('error', 'Site tool refused the operation')
        return value
    except (ValueError, KeyError, TypeError, StopIteration):
        return {}


def verify(call, reply, readback):
    """Return per-record evidence. Unknown responses must not trigger blind retry."""
    args = call['arguments']
    result = decode(reply)
    receipt = {'path': args['path'], 'expectedRevision': args['expectedRevision']}
    if result.get('error') or result.get('isError'):
        return {**receipt, 'status': 'conflict' if result.get('status') == 409 else 'failed', 'error': result.get('error')}
    revision = result.get('revision')
    if type(revision) is not int or revision != args['expectedRevision'] + 1:
        return {**receipt, 'status': 'unknown'}
    if readback is None:
        return {**receipt, 'status': 'pending', 'revision': revision}
    observed = decode(readback)
    if isinstance(readback, dict) and 'call' in readback:
        query = readback['call']
        query_args = query.get('args', {})
        if query.get('tool') != 'adp_query' or query_args.get('artifact') != args['artifact'] or query_args.get('path') != args['path'].rsplit('/', 1)[0]:
            return {**receipt, 'status': 'unknown', 'revision': revision}
        result = decode(readback.get('result'))
        rows = result.get('docs')
        if result.get('error') or not isinstance(rows, list):
            return {**receipt, 'status': 'unknown', 'revision': revision}
        matches = [row for row in rows if isinstance(row, dict) and row.get('id') == args['path'].rsplit('/', 1)[1]]
        if len(matches) != 1:
            return {**receipt, 'status': 'unknown', 'revision': revision}
        observed = {**matches[0], 'exists': True}
        receipt['readbackSource'] = 'adp_query'
    if type(observed.get('revision')) is not int or type(observed.get('exists')) is not bool:
        return {**receipt, 'status': 'unknown', 'revision': revision}
    matched = observed['exists'] and observed['revision'] == revision and observed.get('data') == args['data']
    return {**receipt, 'status': 'verified' if matched else 'conflict',
            'revision': revision, 'observedRevision': observed['revision']}


def read_calls(artifact, collections):
    calls = []
    for collection in collections:
        location(artifact, collection + '/_')
        calls.append({'tool': 'adp_query', 'args': {'artifact': artifact, 'path': collection}, 'collection': collection})
    return calls


def read_doc_calls(artifact, keys):
    calls = []
    for key in keys:
        call = read_call(artifact, key)
        calls.append({'tool': call['name'], 'args': call['arguments'], 'collection': key.rsplit('/', 1)[0], 'keys': [key]})
    return calls


def parse_reads(raw_results):
    """Parse supplied read envelopes; caller must also check every requested call returned."""
    docs, warnings, covered = [], [], []
    for envelope in raw_results:
        call = envelope.get('call', {})
        result = decode(envelope.get('result'))
        collection = call.get('collection')
        try:
            if not collection or result.get('error') or result.get('isError'):
                raise ValueError(result.get('error') or 'Missing read context')
            if call.get('tool') == 'adp_read':
                if type(result.get('exists')) is not bool:
                    raise ValueError('Missing record existence')
                rows = [{**result, 'id': call['args']['path'].rsplit('/', 1)[1]}]
            elif call.get('tool') == 'adp_query' and isinstance(result.get('docs'), list):
                rows = [{**row, 'exists': True} for row in result['docs']]
            else:
                raise ValueError('Incomplete Sites read')
            batch = []
            for row in rows:
                location(call['args']['artifact'], collection + '/' + row['id'])
                if type(row.get('revision')) is not int or row['revision'] < 0 or (row['exists'] and not isinstance(row.get('data'), dict)):
                    raise ValueError('Invalid native snapshot')
                batch.append({'collection': collection, 'id': row['id'], 'data': row.get('data'),
                              'revision': row['revision'], 'exists': row['exists']})
            docs.extend(batch)
            covered.extend(call.get('keys') or [collection])
        except (ValueError, TypeError, KeyError) as error:
            warnings.append(str(error))
    return {'docs': docs, 'complete': bool(raw_results) and not warnings, 'warnings': warnings, 'covered': covered}


def write_calls(artifact, ops):
    calls = []
    for op in ops:
        if op.get('op') not in ('create', 'replace'):
            raise ValueError('Sites import supports create or replace only')
        key = op['collection'] + '/' + op['id']
        guard = op.get('guard')
        if op['op'] == 'create' and guard is None:
            guard = 0  # A tombstone refuses this guard; reread it instead of resetting it.
        native = write_call(artifact, key, op['data'], {'exists': op['op'] == 'replace', 'revision': guard})
        calls.append({'tool': native['name'], 'args': native['arguments'], 'keys': [key], 'atomic': False,
                      'readback': read_doc_calls(artifact, [key])[0]})
    return calls


def parse_receipt(raw_results):
    receipts = []
    for envelope in raw_results:
        call = envelope['call']
        args = call['args']
        result = verify({'arguments': args}, envelope.get('result'), envelope.get('readback'))
        collection, doc_id = args['path'].rsplit('/', 1)
        outcome = {'verified': 'applied', 'conflict': 'rejected', 'failed': 'rejected'}.get(result['status'], 'unknown')
        receipts.append({'collection': collection, 'id': doc_id, 'outcome': outcome,
                         'revision': result.get('revision'), 'error': result.get('error'), 'evidence': result})
    return receipts
