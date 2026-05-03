"""
Persistent retrieval daemon.
Loads the index ONCE on startup, then reads newline-delimited JSON requests
from stdin and writes newline-delimited JSON responses to stdout forever.

Protocol (one line each direction):
  <- {"query": "...", "top_n": 5}
  -> {"results": [...], "latency_seconds": 0.15}
  -> {"error": "..."}          (on failure -- process stays alive)

inference.py is imported as a module -- zero lines of it are modified.
"""
import sys
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
sys.path.insert(0, ROOT)
os.chdir(ROOT)

import inference  # noqa: E402

def main():
    # Load once -- this is the expensive step (~18s cold, ~0s warm)
    try:
        _, retriever = inference.load_or_build(force_rebuild=False)
    except Exception as exc:
        # Fatal: can't serve anything
        sys.stdout.write(json.dumps({"error": f"Init failed: {exc}"}) + "\n")
        sys.stdout.flush()
        sys.exit(1)

    # Signal to Node that we're ready
    sys.stdout.write(json.dumps({"ready": True}) + "\n")
    sys.stdout.flush()

    # Serve requests forever
    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        try:
            req = json.loads(raw_line)
            query = req.get("query", "")
            top_n = max(1, min(int(req.get("top_n", 5)), 20))
            results, latency = retriever.retrieve(query, top_n=top_n)
            response = {"results": results, "latency_seconds": round(latency, 4)}
        except Exception:
            response = {"error": "retrieval_failed"}

        sys.stdout.write(json.dumps(response) + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
