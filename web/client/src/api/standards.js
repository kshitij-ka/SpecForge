const BASE = "/api";

// Safe fetch: always reads body as text first, then parses JSON.
// If the server returns HTML (e.g. 404 from a stale process or proxy miss),
// this surfaces a clear error instead of "Unexpected token '<'".
async function safeFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    throw new Error(`Network error — is the server running? (${networkErr.message})`);
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

export async function fetchStandards({ q = "", category = "", page = 1, limit = 18 } = {}) {
  const params = new URLSearchParams({ q, category, page, limit });
  return safeFetch(`${BASE}/standards?${params}`);
}

export async function fetchStandard(id) {
  return safeFetch(`${BASE}/standards/${encodeURIComponent(id)}`);
}

export async function fetchCategories() {
  return safeFetch(`${BASE}/categories`);
}

export async function fetchStats() {
  return safeFetch(`${BASE}/stats`);
}

export async function askQuestion({ standard_id, question }) {
  return safeFetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ standard_id, question }),
  });
}

// POST /api/recommend — hybrid retrieval + LLM explanations
export async function recommend({ query, top_n = 5, rewrite = false } = {}) {
  return safeFetch(`${BASE}/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_n, rewrite }),
  });
}

// POST /api/ask — chunk-grounded QA for a specific standard
export async function askGrounded({ standard_id, question } = {}) {
  return safeFetch(`${BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ standard_id, question }),
  });
}
