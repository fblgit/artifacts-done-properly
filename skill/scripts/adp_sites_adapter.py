"""Sites record adapter for the shared ADP shell, using existing Site MCP tools.

Calls are executed by the authorized agent. A tool response is not a verified
import until a fresh authoritative read matches both data and native revision.
"""
import copy
import json
import re


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
    if type(observed.get('revision')) is not int or type(observed.get('exists')) is not bool:
        return {**receipt, 'status': 'unknown', 'revision': revision}
    matched = observed['exists'] and observed['revision'] == revision and observed.get('data') == args['data']
    return {**receipt, 'status': 'verified' if matched else 'conflict',
            'revision': revision, 'observedRevision': observed['revision']}
