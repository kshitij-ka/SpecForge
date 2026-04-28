require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");

const { generateExplanation, answerQuestion, rewriteQuery } = require("./services/llmService");
const { retrieve } = require("./services/retrieverService");

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Startup checks ──────────────────────────────────────────────────────────

if (!process.env.GROQ_API_KEY) {
  console.warn(
    "[WARN] GROQ_API_KEY is not set. AI features will return fallback values.\n" +
    "       Copy web/server/.env.example to web/server/.env and add your key."
  );
}

app.use(cors());
app.use(express.json());

// ── Load data ───────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, "../../data/processed");

let standards = [];
let chunks    = [];

try {
  standards = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "standards.json"),        "utf-8"));
  chunks    = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "standards_chunks.json"), "utf-8"));
  console.log(`[init] Loaded ${standards.length} standards, ${chunks.length} chunks`);
} catch (e) {
  console.error("[init] Failed to load data:", e.message);
}

// Pre-build lookups
const standardsById  = {};
const chunksByStd    = {};   // standard_id → [chunk, …]
const byCategory     = {};
const categories     = new Set();

for (const s of standards) {
  standardsById[s.standard_id] = s;
  categories.add(s.category);
  if (!byCategory[s.category]) byCategory[s.category] = [];
  byCategory[s.category].push(s);
}
for (const c of chunks) {
  if (!chunksByStd[c.standard_id]) chunksByStd[c.standard_id] = [];
  chunksByStd[c.standard_id].push(c);
}

// ── Structured logger ───────────────────────────────────────────────────────

function log(endpoint, data) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${endpoint} |`, JSON.stringify(data));
}

// ── Keyword-based search helper (unchanged from original) ───────────────────

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreStandard(standard, query) {
  const q       = normalize(query);
  const qTokens = q.split(" ").filter(Boolean);

  const idNorm      = normalize(standard.standard_id);
  const titleNorm   = normalize(standard.title);
  const summaryNorm = normalize(standard.summary || "");
  const kwNorm      = normalize((standard.keywords || []).join(" "));
  const catNorm     = normalize(standard.category);

  let s = 0;
  if (idNorm.includes(q)) s += 100;
  for (const tok of qTokens) {
    if (tok.length < 2) continue;
    if (idNorm.includes(tok))      s += 20;
    if (titleNorm.includes(tok))   s += 10;
    if (kwNorm.includes(tok))      s += 6;
    if (summaryNorm.includes(tok)) s += 3;
    if (catNorm.includes(tok))     s += 2;
  }
  return s;
}

// ── Best chunk selector ─────────────────────────────────────────────────────

function bestChunk(standardId, question) {
  const stdChunks = chunksByStd[standardId] || [];
  if (!stdChunks.length) return null;

  const qTokens = normalize(question).split(" ").filter((t) => t.length > 2);
  let best = stdChunks[0];
  let bestScore = 0;

  for (const c of stdChunks) {
    const textNorm = normalize(c.text);
    const score = qTokens.reduce((acc, t) => acc + (textNorm.includes(t) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════

// ── GET /api/standards ──────────────────────────────────────────────────────
app.get("/api/standards", (req, res) => {
  const { q = "", category = "", page = "1", limit = "20" } = req.query;
  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  let results = standards;
  if (category) results = results.filter((s) => s.category === category);

  if (q.trim()) {
    results = results
      .map((s) => ({ s, score: scoreStandard(s, q.trim()) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ s }) => s);
  }

  const total      = results.length;
  const totalPages = Math.ceil(total / limitNum);
  const paginated  = results.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  res.json({ data: paginated, meta: { total, page: pageNum, limit: limitNum, totalPages } });
});

// ── GET /api/standards/:id ──────────────────────────────────────────────────
app.get("/api/standards/:id", (req, res) => {
  const id       = decodeURIComponent(req.params.id);
  const standard = standardsById[id];
  if (!standard) return res.status(404).json({ error: "Standard not found" });
  res.json(standard);
});

// ── GET /api/categories ─────────────────────────────────────────────────────
app.get("/api/categories", (req, res) => {
  const result = [...categories].sort().map((cat) => ({
    name:  cat,
    count: byCategory[cat]?.length || 0,
  }));
  res.json(result);
});

// ── GET /api/stats ──────────────────────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  res.json({
    totalStandards:  standards.length,
    totalCategories: categories.size,
    totalChunks:     chunks.length,
  });
});

// ── POST /api/recommend ─────────────────────────────────────────────────────
/**
 * Input:  { query: string, top_n?: number, rewrite?: boolean }
 * Flow:
 *   1. Optionally rewrite query with LLM (parallel, non-blocking on failure)
 *   2. Call Python inference.py via bridge (retrieval logic untouched)
 *   3. Enrich each result with LLM explanation (Promise.allSettled — no blocking)
 *   4. Return standards + explanations + timing breakdown
 *
 * Output: { standards, latency: { retrieval_ms, llm_ms, total_ms } }
 */
app.post("/api/recommend", async (req, res) => {
  const { query, top_n = 5, rewrite = false } = req.body;

  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "query is required." });
  }
  if (query.length > 500) {
    return res.status(400).json({ error: "query must be 500 characters or fewer." });
  }

  const t0 = Date.now();

  // Step 1 — Optional query rewrite (fires concurrently, falls back silently)
  let effectiveQuery = query.trim();
  if (rewrite && process.env.GROQ_API_KEY) {
    effectiveQuery = await rewriteQuery(query.trim()); // never throws
  }

  // Step 2 — Python retrieval (inference.py untouched)
  let retrievalResult;
  const tRetStart = Date.now();
  try {
    retrievalResult = await retrieve(effectiveQuery, Math.min(top_n, 10));
  } catch (err) {
    console.error("[recommend] Retrieval error:", err.message);
    return res.status(502).json({ error: "Retrieval service unavailable. Please try again." });
  }
  const retrievalMs = Date.now() - tRetStart;

  const { results: retrieved, latency_seconds: pyLatency } = retrievalResult;

  // Step 3 — LLM explanations fired in parallel (allSettled — never blocks on failure)
  const tLlmStart = Date.now();
  const explanationJobs = retrieved.map((r) => {
    const std = standardsById[r.standard_id];
    if (!std) return Promise.resolve({ status: "fulfilled", value: r.title });
    return generateExplanation(std).then(
      (exp) => ({ status: "fulfilled",  value: exp }),
      ()    => ({ status: "rejected",   value: std.summary || std.title || "" }),
    );
  });
  const explanations = await Promise.all(explanationJobs);
  const llmMs = Date.now() - tLlmStart;

  // Step 4 — Assemble response
  const standardsOut = retrieved.map((r, i) => {
    const std = standardsById[r.standard_id] || {};
    return {
      standard_id:     r.standard_id,
      title:           r.title,
      category:        r.category,
      matched_section: r.matched_section,
      score:           r.score,
      explanation:     explanations[i].value,
      keywords:        std.keywords || [],
    };
  });

  const totalMs = Date.now() - t0;

  log("POST /api/recommend", {
    query: effectiveQuery,
    results: retrieved.length,
    retrieval_ms: retrievalMs,
    llm_ms: llmMs,
    total_ms: totalMs,
  });

  res.json({
    query:     effectiveQuery,
    standards: standardsOut,
    latency: {
      retrieval_ms: retrievalMs,
      llm_ms:       llmMs,
      total_ms:     totalMs,
    },
  });
});

// ── POST /api/ask ───────────────────────────────────────────────────────────
/**
 * Input:  { question: string, standard_id: string }
 * Flow:
 *   1. Find best matching chunk for the question within the standard
 *   2. Pass chunk text to answerQuestion() — strictly grounded
 *   3. Return answer + chunk source info
 *
 * Output: { answer, source: { standard_id, section, chunk_id } }
 */
app.post("/api/ask", async (req, res) => {
  const { question, standard_id } = req.body;

  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question is required." });
  }
  if (!standard_id || typeof standard_id !== "string") {
    return res.status(400).json({ error: "standard_id is required." });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: "question must be 500 characters or fewer." });
  }

  const t0 = Date.now();

  const chunk = bestChunk(standard_id, question);
  if (!chunk) {
    return res.status(404).json({ error: "No content found for this standard." });
  }

  const tLlm = Date.now();
  const answer = await answerQuestion(question.trim(), chunk.text); // never throws
  const llmMs  = Date.now() - tLlm;
  const totalMs = Date.now() - t0;

  log("POST /api/ask", {
    standard_id,
    question: question.slice(0, 80),
    llm_ms: llmMs,
    total_ms: totalMs,
  });

  res.json({
    answer,
    source: {
      standard_id: chunk.standard_id,
      section:     chunk.section,
      chunk_id:    chunk.chunk_id,
    },
    latency: { llm_ms: llmMs, total_ms: totalMs },
  });
});

// ── POST /api/chat ──────────────────────────────────────────────────────────
/**
 * Conversational QA grounded in a standard's full text.
 * Uses answerQuestion() from llmService — key never leaves server.
 */
app.post("/api/chat", async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: "AI features are not configured on this server." });
  }

  const { standard_id, question } = req.body;

  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question is required." });
  }
  if (question.length > 500) {
    return res.status(400).json({ error: "question must be 500 characters or fewer." });
  }

  const std = standard_id ? standardsById[standard_id] : null;
  let chunkText = "";

  if (std) {
    const chunk = bestChunk(standard_id, question);
    chunkText = chunk ? chunk.text : "";

    // Augment chunk with structured sections for richer context
    const sections = Object.entries(std.key_sections || {})
      .map(([n, t]) => `${n}: ${t}`)
      .join("\n");
    if (sections) chunkText = `${chunkText}\n\n${sections}`.trim();
  }

  const t0 = Date.now();
  const answer = await answerQuestion(question.trim(), chunkText || "Context not available.");
  const totalMs = Date.now() - t0;

  log("POST /api/chat", { standard_id, llm_ms: totalMs });
  res.json({ answer });
});

// ── Start ───────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`[init] BIS API running on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[ERROR] Port ${PORT} is already in use.\n` +
      `        Another server process is still running. Stop it first:\n` +
      `        Windows: netstat -ano | findstr :${PORT}  then  taskkill /PID <pid> /F\n` +
      `        Or change PORT in web/server/.env`
    );
  } else {
    console.error("[ERROR] Server failed to start:", err.message);
  }
  process.exit(1);
});
