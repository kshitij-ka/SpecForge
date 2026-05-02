"use strict";
/**
 * retrieverService.js -- persistent Python daemon.
 *
 * Spawns retrieve.py ONCE when the Node server starts. The Python process
 * loads the FAISS index and BM25 index once, then serves queries via
 * newline-delimited JSON on stdin/stdout.
 *
 * First query: ~150ms (index already warm from startup).
 * Cold start happens in the background while the server is booting.
 *
 * inference.py is never modified.
 */

const { spawn }  = require("child_process");
const path       = require("path");
const readline   = require("readline");
const { EventEmitter } = require("events");

/** @type {string} - Absolute path to bridge/retrieve.py. */
const BRIDGE  = path.join(__dirname, "../bridge/retrieve.py");
/** @type {string} - Repository root, used as cwd for the Python subprocess. */
const ROOT    = path.join(__dirname, "../../..");
/** @type {string} - Python executable; override with PYTHON_BIN env var. */
const PYTHON  = process.env.PYTHON_BIN || "python";

/** @type {number} - Maximum milliseconds to wait for the daemon to signal ready on cold start. */
const BOOT_TIMEOUT_MS  = 90_000;
/** @type {number} - Maximum milliseconds to wait for a single query response once the daemon is warm. */
const QUERY_TIMEOUT_MS = 10_000;

class PythonRetriever extends EventEmitter {
  constructor() {
    super();
    this._proc    = null;
    this._rl      = null;
    this._ready   = false;
    this._error   = null;
    this._queue   = [];   // requests queued before ready: [{query,top_n,resolve,reject,timer}]
    this._pending = [];   // in-flight requests sent to Python: [{resolve,reject,timer}]
    this._start();
  }

  _start() {
    this._ready = false;
    this._error = null;

    console.log("[retriever] Starting Python daemon (first boot ~20s)...");

    this._proc = spawn(PYTHON, [BRIDGE], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this._rl = readline.createInterface({ input: this._proc.stdout, crlfDelay: Infinity });

    this._rl.on("line", (raw) => this._onLine(raw));

    this._proc.stderr.on("data", (d) => {
      const text = d.toString();
      // Suppress routine model-loading noise
      if (
        text.includes("Loading cached") ||
        text.includes("BM25 index") ||
        text.includes("Loaded ") ||
        text.includes("Building BM25")
      ) return;
      process.stderr.write("[py] " + text);
    });

    this._proc.on("close", (code) => {
      console.warn(`[retriever] Daemon exited (code ${code}), restarting on next query.`);
      this._ready = false;
      this._proc  = null;
      this._rl    = null;
      // Reject anything still in flight
      for (const p of [...this._queue, ...this._pending]) {
        clearTimeout(p.timer);
        p.reject(new Error("Python retriever restarted unexpectedly."));
      }
      this._queue.length   = 0;
      this._pending.length = 0;
    });

    this._proc.on("error", (err) => {
      console.error("[retriever] Spawn error:", err.message);
      this._error = err.message;
      for (const p of [...this._queue, ...this._pending]) {
        clearTimeout(p.timer);
        p.reject(new Error(`Retriever spawn failed: ${err.message}`));
      }
      this._queue.length   = 0;
      this._pending.length = 0;
    });
  }

  _onLine(raw) {
    raw = raw.trim();
    if (!raw) return;

    let msg;
    try { msg = JSON.parse(raw); }
    catch { return; }  // ignore non-JSON (e.g. sentence-transformers progress bars)

    // Startup handshake: wait for {"ready":true} before flushing the queue.
    if (!this._ready) {
      if (msg.ready) {
        this._ready = true;
        console.log(`[retriever] Ready -- flushing ${this._queue.length} queued request(s).`);
        // Send all queued requests in order
        for (const item of this._queue) {
          this._pending.push(item);
          this._send(item);
        }
        this._queue.length = 0;
      } else if (msg.error) {
        this._error = msg.error;
        console.error("[retriever] Init failed:", msg.error);
        for (const p of this._queue) { clearTimeout(p.timer); p.reject(new Error(msg.error)); }
        this._queue.length = 0;
      }
      return;
    }

    // Query response -- resolve/reject the oldest in-flight request (FIFO).
    const item = this._pending.shift();
    if (!item) return;
    clearTimeout(item.timer);

    if (msg.error) {
      item.reject(new Error(msg.error));
    } else {
      item.resolve({
        results:          msg.results        || [],
        latency_seconds:  msg.latency_seconds ?? 0,
      });
    }
  }

  _send(item) {
    if (!this._proc || this._proc.killed) return;
    this._proc.stdin.write(
      JSON.stringify({ query: item.query, top_n: item.top_n }) + "\n"
    );
  }

  /**
   * @param {string} query
   * @param {number} topN
   * @returns {Promise<{ results: Array, latency_seconds: number }>}
   */
  retrieve(query, topN = 5) {
    // Restart if crashed
    if (!this._proc) this._start();

    return new Promise((resolve, reject) => {
      if (this._error) {
        return reject(new Error(this._error));
      }

      const timeoutMs = this._ready ? QUERY_TIMEOUT_MS : BOOT_TIMEOUT_MS;
      const item = { query, top_n: topN, resolve, reject, timer: null };

      item.timer = setTimeout(() => {
        // Remove from whichever queue it's in
        let idx = this._queue.indexOf(item);
        if (idx !== -1) this._queue.splice(idx, 1);
        idx = this._pending.indexOf(item);
        if (idx !== -1) this._pending.splice(idx, 1);
        reject(new Error(`Retriever timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      if (this._ready) {
        // Send immediately and wait for response
        this._pending.push(item);
        this._send(item);
      } else {
        // Queue until daemon signals ready
        this._queue.push(item);
      }
    });
  }
}

// Singleton -- one daemon for the lifetime of the Node process
const retriever = new PythonRetriever();

module.exports = { retrieve: (q, n) => retriever.retrieve(q, n) };
