"""Local browser-check server: python3 tests/serve.py (http://127.0.0.1:8001)."""
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
reports = {}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path not in ("/__checks/blocks", "/__checks/water"):
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        if not 0 < length < 100000:
            self.send_error(400)
            return
        try:
            report = json.loads(self.rfile.read(length))
        except (ValueError, UnicodeError):
            self.send_error(400)
            return
        reports[self.path.rsplit("/", 1)[-1]] = report
        print(json.dumps(report), flush=True)
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/__checks":
            body = json.dumps(reports).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    print("Browser checks: http://127.0.0.1:8001/tests/blocks-browser.html", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8001), Handler).serve_forever()
