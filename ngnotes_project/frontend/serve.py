"""Tiny dev-only static server with no-cache headers for the NGNotes frontend."""

import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class FastBindHTTPServer(ThreadingHTTPServer):
    """ThreadingHTTPServer that skips the reverse-DNS lookup on bind.

    The stock ``server_bind`` calls ``socket.getfqdn(host)`` which can hang for
    seconds on macOS when mDNS / DNS resolution is misbehaving.
    """

    def server_bind(self):
        # Inline the base TCPServer.server_bind() bits and skip getfqdn.
        if getattr(self, "allow_reuse_address", False):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.socket.bind(self.server_address)
        self.server_address = self.socket.getsockname()
        host, port = self.server_address[:2]
        self.server_name = host or "localhost"
        self.server_port = port


if __name__ == "__main__":
    addr = ("0.0.0.0", 5500)
    with FastBindHTTPServer(addr, NoCacheHandler) as httpd:
        print(f"Serving frontend (threaded, no-cache) on http://localhost:{addr[1]}/", flush=True)
        httpd.serve_forever()
