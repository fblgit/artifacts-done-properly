#!/usr/bin/env python3
"""Local broadcast bus: HTTP over .adp/bus.sock, transcript in .adp/bus.jsonl."""
import argparse
import http.client
import http.server
import json
import os
from pathlib import Path
import queue
import socket
import socketserver
import subprocess
import sys
import threading
import time
import uuid


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--serve', action='store_true')
    mode.add_argument('--subscribe', metavar='NAME')
    mode.add_argument('--send', metavar='TEXT')
    mode.add_argument('--send-file', metavar='PATH')
    mode.add_argument('--search', metavar='TEXT')
    parser.add_argument('--name', default=os.environ.get('USER', 'human'))
    parser.add_argument('--thread', help='Queue subscription events to this Codex chat')
    args = parser.parse_args(argv)
    if args.thread and not args.subscribe:
        parser.error('--thread requires --subscribe')
    return args


def format_event(event):
    if event['type'] == 'receivers':
        return f"[ADP-BUS] ID: {event['id']} : receivers :: " + ' | '.join(event['receivers'])
    return f"[ADP-MSG] ID: {event['id']} from {event['sender']} :: {event['text']}"


def queue_event(event, thread, receiver):
    if event.get('sender') == receiver:
        return
    # Build the marker at the final command boundary, never from raw message text.
    subprocess.run(
        ['codex', 'queue', '--thread', thread, '--message', format_event(event)],
        check=True, timeout=10,
    )


class Connection(http.client.HTTPConnection):
    def __init__(self, sock):
        super().__init__('localhost')
        self.path = str(sock)

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.path)


def serve(root):
    sock, log = root / 'bus.sock', root / 'bus.jsonl'
    root.mkdir(exist_ok=True)
    lock = threading.RLock()
    receivers = {}
    sequence = 0
    if log.exists():
        with log.open() as stream:
            for line in stream:
                sequence = max(sequence, json.loads(line)['id'])

    def emit(kind, **fields):
        nonlocal sequence
        with lock:
            sequence += 1
            event = dict(id=sequence, at=time.time(), type=kind, **fields)
            encoded = json.dumps(event, ensure_ascii=False) + '\n'
            with log.open('a') as stream:
                stream.write(encoded)
                stream.flush()
            for _, inbox in receivers.values():
                inbox.put(encoded.encode())
            return event

    def presence():
        emit('receivers', receivers=[name for name, _ in receivers.values()])

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            if self.path != '/messages':
                self.send_error(404)
                return
            try:
                data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
                if not isinstance(data['sender'], str) or not isinstance(data['text'], str):
                    raise ValueError('sender and text must be strings')
            except (ValueError, TypeError, KeyError):
                self.send_error(400, 'Expected JSON sender and text strings')
                return
            event = emit('message', sender=data['sender'], text=data['text'])
            self.send_response(201)
            self.end_headers()
            self.wfile.write(json.dumps(event).encode() + b'\n')

        def do_GET(self):
            if self.path == '/messages':
                self.send_response(200)
                self.end_headers()
                with lock:
                    if log.exists():
                        self.wfile.write(log.read_bytes())
                return
            if self.path != '/subscribe':
                self.send_error(404)
                return
            key, inbox = uuid.uuid4().hex, queue.Queue()
            self.send_response(200)
            self.send_header('Content-Type', 'application/x-ndjson')
            self.end_headers()
            with lock:
                receivers[key] = (self.headers.get('X-Receiver', 'anonymous'), inbox)
                presence()
            try:
                while True:
                    try:
                        line = inbox.get(timeout=1)
                    except queue.Empty:
                        line = b'\n'
                    self.wfile.write(line)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                with lock:
                    receivers.pop(key, None)
                    presence()

    class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
        daemon_threads = True

    if sock.exists():
        probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            probe.connect(str(sock))
        except ConnectionRefusedError:
            sock.unlink()
        else:
            raise SystemExit('bus is already running')
        finally:
            probe.close()
    with Server(str(sock), Handler) as server:
        os.chmod(sock, 0o600)
        print('Listening on ' + str(sock), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            sock.unlink(missing_ok=True)


def client(args, root):
    parser = argparse.ArgumentParser(prog='adp_bus.py')
    client = Connection(root / 'bus.sock')
    try:
        if args.subscribe:
            client.request('GET', '/subscribe', headers={'X-Receiver': args.subscribe})
        elif args.search is not None:
            client.request('GET', '/messages')
        else:
            text = Path(args.send_file).read_text(encoding='utf-8') if args.send_file else args.send
            client.request('POST', '/messages', json.dumps(dict(sender=args.name, text=text)))
        response = client.getresponse()
        if response.status >= 400:
            raise SystemExit(response.read().decode())
        for line in response:
            text = line.decode().strip()
            if text and (args.search is None or args.search.casefold() in text.casefold()):
                event = json.loads(text)
                compact = format_event(event)
                print(compact, flush=True)
                if args.thread:
                    try:
                        queue_event(event, args.thread, args.subscribe)
                    except (OSError, subprocess.SubprocessError) as error:
                        print('Queue delivery failed: ' + str(error), file=sys.stderr, flush=True)
    except (FileNotFoundError, ConnectionRefusedError):
        parser.error('start the bus first with --serve')
    except KeyboardInterrupt:
        pass
    finally:
        client.close()


def main(argv=None):
    args = parse_args(argv)
    root = Path.cwd() / ".adp"
    if args.serve:
        serve(root)
    else:
        client(args, root)


if __name__ == "__main__":
    main()
