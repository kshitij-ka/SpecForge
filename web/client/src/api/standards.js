const BASE = "/api";

/**
 * Safely fetches JSON from the server, handling edge cases where the server
 * may return HTML/plain text (e.g., proxy errors, stale process 404s).
 * @param {string} url - The endpoint URL.
 * @param {RequestInit} [options={}] - Fetch options.
 * @returns {Promise<Object>} Parsed JSON response.
 * @throws {Error} On network failure or non-OK responses.
 */
async function safeFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    const err = new Error(`Network error — is the server running? (${networkErr.message})`);
    err.cause = networkErr;
    throw err;
  }

  const text = await res.text();

  // Try JSON parse
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Server returned non-JSON (HTML error page, proxy 502, etc.)
    const preview = text.slice(0, 120).replace(/<[^>]+>/g, "").trim();
    throw new Error(
      `Server returned ${res.status} ${res.statusText}` +
      (preview ? `: ${preview}` : "")
    );
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  return data;
}

/**
 * Fetches a paginated list of standards with optional filtering.
 * @param {Object} [params={}] - Query parameters.
 * @param {string} [params.q=""] - Search query.
 * @param {string} [params.category=""] - Category filter.
 * @param {number} [params.page=1] - Page number.
 * @param {number} [params.limit=18] - Results per page.
 * @returns {{data: Object[], meta: {total: number, page: number, limit: number, totalPages: number}}}
 */
export async function fetchStandards({ q = "", category = "", page = 1, limit = 18 } = {}) {
  const params = new URLSearchParams({ q, category, page, limit });
  return safeFetch(`${BASE}/standards?${params}`);
}

/**
 * Fetches a single standard by its IS identifier.
 * @param {string} id - The standard IS ID (e.g., "IS 269").
 * @returns {Promise<Object>} The standard object.
 */
export async function fetchStandard(id) {
  return safeFetch(`${BASE}/standards/${encodeURIComponent(id)}`);
}

/**
 * Fetches all material categories.
 * @returns {Promise<Array<{name: string, count: number}>>}
 */
export async function fetchCategories() {
  return safeFetch(`${BASE}/categories`);
}

/**
 * Fetches portal statistics.
 * @returns {{totalStandards: number, totalCategories: number, totalChunks: number}}
 */
export async function fetchStats() {
  return safeFetch(`${BASE}/stats`);
}

/**
 * Asks a conversational question about a specific standard.
 * @param {Object} params - Parameters.
 * @param {string} params.standard_id - The standard IS ID.
 * @param {string} params.question - The question.
 * @returns {{answer: string}}
 */
export async function askQuestion({ standard_id, question }) {
  return safeFetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ standard_id, question }),
  });
}

/**
 * Hybrid retrieval with AI explanations.
 * Uses FAISS + BM25 for retrieval, then Groq LLM for explanations.
 * @param {Object} [params={}] - Query parameters.
 * @param {string} params.query - Natural language query.
 * @param {number} [params.top_n=5] - Number of results.
 * @param {boolean} [params.rewrite=false] - Whether to rewrite the query with AI.
 * @returns {{query: string, standards: Object[], latency: {retrieval_ms: number, llm_ms: number, total_ms: number}}}
 */
export async function recommend({ query, top_n = 5, rewrite = false } = {}) {
  return safeFetch(`${BASE}/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_n, rewrite }),
  });
}

/**
 * Chunk-grounded QA for a specific standard.
 * @param {Object} [params={}] - Parameters.
 * @param {string} params.standard_id - The standard IS ID.
 * @param {string} params.question - The question.
 * @returns {{answer: string, source: {standard_id: string, section: string, chunk_id: string}, latency: {llm_ms: number, total_ms: number}}}
 */
export async function askGrounded({ standard_id, question } = {}) {
  return safeFetch(`${BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ standard_id, question }),
  });
}
