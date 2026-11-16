"""Durable agent work on existing ADP requests/incoming records; emit guarded native calls.
The executor remains responsible for authorization and genuine host receipts. No network or model calls.
"""
import copy
import datetime
import hashlib
import json
import re
import sys
import uuid

import adp_bundle

A = None


def timestamp(value):
    try:
        parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError()
        return parsed
    except (AttributeError, TypeError, ValueError):
        sys.exit('Invalid work lease timestamp')


def intent(data, collection):
    keys = ('text', 'scope', 'quote', 'workGeneration') if collection == 'requests' else ('files', 'parts', 'base')
    return adp_bundle.chash({k: data.get(k) for k in keys})


def publication(receipt, data):
    deployment, source = receipt.get('deployment', {}), receipt.get('source', {})
    manifest = receipt.get('manifest', {})
    change = receipt.get('change', {})
    if deployment.get('status') != 'succeeded' or not deployment.get('id') or not deployment.get('version_id'):
        sys.exit('Completion needs a successful native deployment receipt')
    if not re.fullmatch(r'[0-9a-f]{40}', source.get('commit_sha', '')) or source.get('version_id') != deployment['version_id'] or source.get('project_id') != deployment.get('project_id'):
        sys.exit('Source receipt must identify the same Site and saved version')
    for record in (manifest, change):
        if record.get('exists') is not True or type(record.get('revision')) is not int or record['revision'] < 1 or record.get('data', {}).get('version') != deployment['id']:
            sys.exit('Completion needs native manifest and change readbacks for this deployment')
    for entry in data.get('files') or []:
        path, content = entry['path'], entry.get('content')
        if content is None:
            if path in manifest['data'].get('files', {}) or receipt.get('readback', {}).get('removed', {}).get(path) is not True:
                sys.exit('Deleted source file has not been verified absent')
            continue
        if not isinstance(content, str):
            sys.exit('Publication needs materialized proposal files')
        sha = hashlib.sha256(content.encode()).hexdigest()
        if source.get('shas', {}).get(path) != sha or receipt.get('readback', {}).get('shas', {}).get(path) != sha or manifest['data'].get('files', {}).get(path) != sha[:12]:
            sys.exit('Proposal, deployed source and recorded manifest hashes must match')
    return deployment['id']


def work(a):
    pos, adapter = A.bare(a[1:]), adp_bundle.adapter(a)
    artifact, path = A.opt(a, '--artifact'), A.opt(a, '--path')
    if not artifact or not path or not re.fullmatch(r'(requests|incoming)/[A-Za-z0-9_.~-]+', path):
        sys.exit('work needs --artifact ID --path requests/ID|incoming/ID')
    collection, doc_id = path.split('/')
    reads = adapter.read_doc_calls(artifact, [path]) if hasattr(adapter, 'read_doc_calls') else adapter.read_calls(artifact, [collection])
    if not pos:
        return adp_bundle.reads(reads)
    if len(pos) != 1:
        sys.exit('work accepts one native read file')
    if '--raw' in a:
        raw = json.load(open(pos[0], encoding='utf-8'))
        for envelope in raw:
            args = envelope.get('call', {}).get('args', {})
            if args.get('artifact', args.get('url')) != artifact:
                sys.exit('Work read belongs to another artifact')
    docs, _, _ = adp_bundle.reads_in(a, pos[0])
    row = docs.get(path)
    if not row or type(row.get('revision')) is not int or row['revision'] < 1:
        sys.exit('Read the existing work record and its native revision first')
    data = copy.deepcopy(row['data'])
    actor, action = A.opt(a, '--by'), A.opt(a, '--action', 'inspect')
    execution = data.get('execution') or {}
    if action == 'inspect':
        return A.emit({'path': path, 'revision': row['revision'], 'status': data.get('status'), 'resolved': data.get('resolved') is True, 'execution': execution})
    if action not in ('claim', 'progress', 'checkpoint', 'block', 'complete') or not actor or len(actor) > 120:
        sys.exit('work needs --by NAME and --action claim|progress|checkpoint|block|complete')
    if data.get('status') in ('done', 'applied', 'declined'):
        sys.exit('Work is already closed; reread before starting another operation')
    now = datetime.datetime.now(datetime.timezone.utc)
    at = now.isoformat(timespec='seconds').replace('+00:00', 'Z')
    lease = A.opt(a, '--lease-seconds', '300')
    if not str(lease).isdigit() or not 30 <= int(lease) <= 7200:
        sys.exit('Lease must be between 30 and 7200 seconds')
    token = A.opt(a, '--token')
    live = bool(execution.get('leaseUntil')) and timestamp(execution['leaseUntil']) > now
    fingerprint = intent(data, collection)
    if collection == 'incoming' and (data.get('publishRequest') or {}).get('inputHash') != fingerprint:
        sys.exit('Publication needs editor approval bound to the current proposal')
    if action == 'claim':
        if execution.get('state') == 'blocked':
            sys.exit('Blocked work needs new user input or a renewed publication request')
        if live:
            sys.exit('Work has an active lease; inspect it instead of starting duplicate work')
        token = str(uuid.uuid4())
        execution = {**execution, 'schema': 'adp-work/1', 'actor': actor, 'token': token, 'attempt': execution.get('attempt', 0) + 1,
                     'inputHash': fingerprint, 'claimedAt': at, 'state': 'working'}
        data.update({'ackBy': actor, 'ackAt': at})
    elif not live or token != execution.get('token') or actor != execution.get('actor') or fingerprint != execution.get('inputHash'):
        sys.exit('Lease expired, changed input or wrong claimant; reread and reclaim before work')
    execution['leaseUntil'] = (now + datetime.timedelta(seconds=int(lease))).isoformat(timespec='seconds').replace('+00:00', 'Z')
    execution['updatedAt'] = at
    text = A.opt(a, '--text', '')
    if action != 'claim' and not text.strip():
        sys.exit('Describe the progress, blocker or verified result with --text')
    if text:
        data['progress'] = list(data.get('progress') or []) + [{'at': at, 'text': text, 'by': actor}]
    if action == 'checkpoint':
        checkpoint = A.opt(a, '--checkpoint') or sys.exit('checkpoint needs --checkpoint JSON_FILE')
        execution['checkpoint'] = json.load(open(checkpoint, encoding='utf-8'))
    if action == 'block':
        execution.update({'state': 'blocked', 'leaseUntil': at, 'reason': text})
    if action == 'complete':
        receipt_path = A.opt(a, '--receipt') or sys.exit('Completion needs --receipt JSON_FILE with verified evidence')
        receipt = json.load(open(receipt_path, encoding='utf-8'))
        checks = receipt.get('checks')
        if not isinstance(checks, list) or not checks or any(not isinstance(c, dict) or c.get('passed') is not True or not c.get('name') or not c.get('evidence') for c in checks):
            sys.exit('Every completion check must pass and carry evidence')
        version = publication(receipt, data) if collection == 'incoming' else ''
        execution.update({'state': 'done', 'leaseUntil': at, 'receipt': receipt, 'result': text})
        if collection == 'incoming':
            data.update({'status': 'applied', 'applied': {'version': version, 'at': at}, 'decided': {'by': actor, 'at': at, 'reason': text}})
        else:
            if data.get('response'):
                reply = receipt.get('reply', {})
                if not re.fullmatch(re.escape(path) + r'/turns/[0-9]+', reply.get('path', '')) or reply.get('exists') is not True or type(reply.get('revision')) is not int or reply['revision'] < 1 or reply.get('data', {}).get('text') != text or reply['data'].get('by') != actor or timestamp(reply['data'].get('at')) < timestamp(execution['claimedAt']):
                    sys.exit('Reopened request needs a verified new native reply turn; preserve the original response')
            else:
                data['response'] = text
            data.update({'status': 'done', 'doneAt': at})
    data['execution'] = execution
    if collection == 'requests':
        data['state'] = 'done' if action == 'complete' else 'waiting' if action == 'block' else 'working'
        data['delivery'] = 'completed' if action == 'complete' else 'acknowledged'
    calls = adapter.write_calls(artifact, [{'op': 'replace', 'collection': collection, 'id': doc_id, 'data': data, 'guard': row['revision']}])
    return A.emit({'schema': 'adp-work-plan/1', 'path': path, 'action': action, 'leaseToken': token, 'calls': calls,
                   'next': 'Execute the guarded call and verify its native readback before any side effect. On unknown outcome inspect; never blindly retry.',
                   'verification': 'Evidence is supplied by the authorized executor; this planner does not independently attest host receipts.'})
