require("dotenv").config();

const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");
const path       = require("path");
const fs         = require("fs");

const { generateExplanation, answerQuestion, rewriteQuery } = require("./services/llmService");
const { retrieve } = require("./services/retrieverService");

const app  = express();

/** @type {number} - HTTP port, defaults to 5000. */
const PORT = process.env.PORT || 5000;

// Warn early when the Groq key is absent so AI degradation is visible at boot.
if (!process.env.GROQ_API_KEY) {
  console.warn(
    "[WARN] GROQ_API_KEY is not set. AI features will return fallback values.\n" +
    "       Copy web/server/.env.example to web/server/.env and add your key."
  );
}

app.use(helmet());

/**
 * @type {string[]} - Allowed CORS origins; reads CORS_ORIGIN env var (comma-separated) or
 *   falls back to localhost dev/preview ports.
 */
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:4173", `http://localhost:${PORT}`];

app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser requests (curl, server-to-server) and configured origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

/** @type {import('express-rate-limit').RateLimitRequestHandler} - 60 req/min applied to all /api/ routes. */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." },
});

/** @type {import('express-rate-limit').RateLimitRequestHandler} - 20 req/min applied to LLM-backed endpoints. */
const llmLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI request limit reached. Please wait before trying again." },
});

app.use("/api/", apiLimiter);
app.use("/api/recommend", llmLimiter);
app.use("/api/ask",       llmLimiter);
app.use("/api/chat",      llmLimiter);

app.use(express.json({ limit: "16kb" }));

/** @type {string} - Absolute path to the processed data directory. */
const DATA_DIR = path.join(__dirname, "../../data/processed");

let standards = [];
let chunks    = [];

try {
  standards = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "standards.json"),        "utf-8"));
  chunks    = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "standards_chunks.json"), "utf-8"));
  if (!Array.isArray(standards) || !Array.isArray(chunks)) {
    throw new Error("standards.json or standards_chunks.json is not a JSON array");
  }
  console.log(`[init] Loaded ${standards.length} standards, ${chunks.length} chunks`);
} catch (e) {
  console.error("[init] Failed to load data:", e.message);
  console.error("[init] API will return empty results. Run the data pipeline first.");
}

// Pre-build lookups
const standardsById  = {};
const chunksByStd    = {};   // standard_id: [chunk, ...]
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

/** @type {RegExp} - Matches ASCII control characters and Unicode BiDi override characters that should be stripped from user input. */
const CONTROL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u202A-\u202E\u2066-\u2069]/g;

/**
 * Strips control characters and truncates a string to a safe length.
 * Returns an empty string if the value is not a string.
 * @param {*} value
 * @param {number} [maxLen=500]
 * @returns {string}
 */
function sanitizeText(value, maxLen = 500) {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHAR_RE, "").slice(0, maxLen).trim();
}

/** @type {RegExp} - Accepts IS standard IDs: letters, digits, spaces, colons, parens, dots, hyphens. */
const STANDARD_ID_RE = /^[A-Za-z0-9 :().-]{1,60}$/;

/**
 * Returns true if the value is a well-formed IS standard identifier.
 * @param {*} id
 * @returns {boolean}
 */
function isValidStandardId(id) {
  return typeof id === "string" && STANDARD_ID_RE.test(id.trim());
}

/**
 * Writes a structured JSON log line to stdout with a UTC timestamp.
 * @param {string} endpoint - Route label, e.g. "POST /api/recommend".
 * @param {object} data - Arbitrary key/value pairs to include in the log entry.
 */
function log(endpoint, data) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${endpoint} |`, JSON.stringify(data));
}

/**
 * Normalises a string to lowercase alphanumeric tokens for keyword matching.
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Scores a standard against a query using weighted keyword matching across id, title,
 * keywords, summary, and category fields.
 * @param {object} standard - A standards.json record.
 * @param {string} query - Raw search query string.
 * @returns {number} Relevance score; higher is more relevant.
 */
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

/**
 * Returns the chunk from a standard that best matches the given question via token overlap.
 * Falls back to the first chunk if no tokens produce a positive score.
 * @param {string} standardId - IS standard identifier key into chunksByStd.
 * @param {string} question - User question used for token matching.
 * @returns {{ text: string, section: string, chunk_id: string, standard_id: string } | null}
 */
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

// Serve React production build when NODE_ENV=production
const CLIENT_DIST = path.join(__dirname, "../client/dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
}

// Routes

/**
 * GET /api/standards
 * Returns a paginated, optionally filtered and keyword-scored list of standards.
 * Query params: q (search string), category, page, limit.
 */
app.get("/api/standards", (req, res) => {
  const q        = sanitizeText(req.query.q || "", 200);
  const category = sanitizeText(req.query.category || "", 100);
  const pageNum  = Math.max(1, parseInt(req.query.page,  10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

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

/**
 * GET /api/standards/:id
 * Returns a single standard by its IS identifier; 404 if not found, 400 if the id is malformed.
 */
app.get("/api/standards/:id", (req, res) => {
  const raw = req.params.id;
  if (!isValidStandardId(raw)) {
    return res.status(400).json({ error: "Invalid standard ID format." });
  }
  const standard = standardsById[raw.trim()];
  if (!standard) return res.status(404).json({ error: "Standard not found." });
  res.json(standard);
});

/**
 * GET /api/categories
 * Returns all categories sorted alphabetically, each with its standard count.
 */
app.get("/api/categories", (req, res) => {
  const result = [...categories].sort().map((cat) => ({
    name:  cat,
    count: byCategory[cat]?.length || 0,
  }));
  res.json(result);
});

/**
 * GET /api/stats
 * Returns aggregate counts of standards, categories, and chunks loaded in memory.
 */
app.get("/api/stats", (req, res) => {
  res.json({
    totalStandards:  standards.length,
    totalCategories: categories.size,
    totalChunks:     chunks.length,
  });
});

/**
 * POST /api/recommend
 * Hybrid retrieval endpoint: optionally rewrites the query, calls the Python daemon,
 * then attaches parallel LLM explanations to each result.
 *
 * @param {{ query: string, top_n?: number, rewrite?: boolean }} req.body
 * @returns {{ query: string, standards: Array, latency: { retrieval_ms: number, llm_ms: number, total_ms: number } }}
 */
app.post("/api/recommend", async (req, res) => {
  const rawQuery = req.body?.query;
  const top_n    = Math.min(10, Math.max(1, parseInt(req.body?.top_n, 10) || 5));
  const rewrite  = req.body?.rewrite === true;

  const query = sanitizeText(rawQuery, 500);
  if (!query) {
    return res.status(400).json({ error: "query is required and must be a non-empty string." });
  }

  const t0 = Date.now();

  // Step 1 - Optional query rewrite (fires concurrently, falls back silently)
  let effectiveQuery = query;
  if (rewrite && process.env.GROQ_API_KEY) {
    effectiveQuery = await rewriteQuery(query.trim()); // never throws
  }

  // Step 2 - Python retrieval (inference.py untouched)
  let retrievalResult;
  const tRetStart = Date.now();
  try {
    retrievalResult = await retrieve(effectiveQuery, top_n);
  } catch (err) {
    console.error("[recommend] Retrieval error:", err.message);
    return res.status(502).json({ error: "Retrieval service unavailable. Please try again." });
  }
  const retrievalMs = Date.now() - tRetStart;

  const { results: retrieved, latency_seconds: pyLatency } = retrievalResult;

  // Step 3 - LLM explanations fired in parallel (allSettled - never blocks on failure)
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

  // Step 4 - Assemble response
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
    query: sanitizeText(effectiveQuery, 200),
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

/**
 * POST /api/ask
 * Answers a question grounded in the best-matching chunk of a specific standard.
 *
 * @param {{ question: string, standard_id: string }} req.body
 * @returns {{ answer: string, source: { standard_id: string, section: string, chunk_id: string }, latency: object }}
 */
app.post("/api/ask", async (req, res) => {
  const question    = sanitizeText(req.body?.question, 500);
  const standard_id = sanitizeText(req.body?.standard_id, 60);

  if (!question) {
    return res.status(400).json({ error: "question is required and must be a non-empty string." });
  }
  if (!standard_id || !isValidStandardId(standard_id)) {
    return res.status(400).json({ error: "standard_id is required and must be a valid IS identifier." });
  }

  const t0 = Date.now();

  const chunk = bestChunk(standard_id, question);
  if (!chunk) {
    return res.status(404).json({ error: "No content found for this standard." });
  }

  const tLlm = Date.now();
  const answer = await answerQuestion(question, chunk.text); // never throws
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

/**
 * POST /api/chat
 * Conversational QA grounded in a standard's full text; 503 if GROQ_API_KEY is absent.
 *
 * @param {{ question: string, standard_id?: string }} req.body
 * @returns {{ answer: string }}
 */
app.post("/api/chat", async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: "AI features are not configured on this server." });
  }

  const question    = sanitizeText(req.body?.question, 500);
  const standard_id = sanitizeText(req.body?.standard_id || "", 60);

  if (!question) {
    return res.status(400).json({ error: "question is required and must be a non-empty string." });
  }

  const std = (standard_id && isValidStandardId(standard_id))
    ? standardsById[standard_id] ?? null
    : null;
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

// SPA fallback: serve index.html for all non-API routes in production
if (process.env.NODE_ENV === "production" && fs.existsSync(CLIENT_DIST)) {
  app.get("*", (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("[ERROR] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[ERROR] Uncaught exception:", err.message);
  process.exit(1);
});

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
