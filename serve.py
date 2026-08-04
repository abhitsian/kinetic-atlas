#!/usr/bin/env python3
"""Static server for Kinetic Atlas that never caches.

python -m http.server lets Chrome hold on to app.js and index.html, so edits
appear not to land. This sends no-store on every response instead.
"""
import functools
import http.server
import socket
import socketserver
import sys
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5231
ROOT = Path(__file__).parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    # keep-alive, so the model download and the JSON fetch don't reset each other
    protocol_version = "HTTP/1.1"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *args):
        pass


class Server(socketserver.ThreadingTCPServer):
    """Threaded: the 4.8 MB model and the exercise JSON load concurrently.
    Dual-stack so both ::1 and 127.0.0.1 answer to "localhost"."""
    allow_reuse_address = True
    daemon_threads = True
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


handler = functools.partial(NoCacheHandler, directory=str(ROOT))
with Server(("", PORT), handler) as httpd:
    print(f"Kinetic Atlas on http://localhost:{PORT}")
    httpd.serve_forever()
