"use strict";
/**
 * llmService.js
 * All Groq LLM calls live here. Three functions:
 *   generateExplanation(standard)  — 2-3 sentence plain-English summary
 *   answerQuestion(question, chunk) — grounded QA, strict context-only
 *   rewriteQuery(query)            — optional query expansion
 *
 * Key rules enforced here:
 *  - GROQ_API_KEY never leaves this file toward the client
 *  - max_tokens kept short to minimise latency (<400 tokens each)
 *  - Every function returns a fallback value on failure — callers never throw
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

// ── Core fetch wrapper ──────────────────────────────────────────────────────

async function _groqCall({ systemPrompt, userMessage, maxTokens = 256, temperature = 0.2 }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Groq ${res.status}: ${body?.error?.message || "unknown error"}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

// ── 1. generateExplanation ──────────────────────────────────────────────────

/**
 * Produces a 2-3 sentence plain-English explanation of a standard.
 * Falls back to the standard's own summary on failure — never throws.
 *
 * @param {{ standard_id: string, title: string, summary?: string, content?: string, key_sections?: object }} standard
 * @returns {Promise<string>}
 */
async function generateExplanation(standard) {
  const context = buildStandardContext(standard);

  try {
    return await _groqCall({
      systemPrompt:
        "You are a technical writer for the Bureau of Indian Standards (BIS). " +
        "Explain building material standards in simple English for engineers and contractors. " +
        "Use ONLY the provided standard text — do not add, invent, or infer anything not explicitly stated. " +
        "Write exactly 2-3 sentences. No bullet points. No headings.",
      userMessage:
        `Explain this BIS standard in simple terms using ONLY the provided information:\n\n${context}`,
      maxTokens: 180,
      temperature: 0.2,
    });
  } catch (err) {
    // Graceful fallback — retrieval is unaffected
    return standard.summary || standard.title || "";
  }
}

// ── 2. answerQuestion ───────────────────────────────────────────────────────

/**
 * Answers a user question strictly from a chunk of standard text.
 * Returns "Not found in standard" when context doesn't contain the answer.
 * Never throws.
 *
 * @param {string} question
 * @param {string} chunkText  — raw chunk text from standards_chunks.json
 * @returns {Promise<string>}
 */
async function answerQuestion(question, chunkText) {
  if (!question?.trim() || !chunkText?.trim()) {
    return "Not found in standard";
  }

  try {
    return await _groqCall({
      systemPrompt:
        "You are a precise technical assistant for BIS Indian Standards. " +
        "Answer questions using ONLY the provided context text. " +
        "If the answer is not present in the context, respond with exactly: 'Not found in standard'. " +
        "Do not speculate. Do not reference other standards not mentioned in the context. " +
        "Keep answers under 100 words.",
      userMessage:
        `CONTEXT:\n${chunkText}\n\nQUESTION: ${question.trim()}`,
      maxTokens: 200,
      temperature: 0.1,
    });
  } catch (err) {
    return "Not found in standard";
  }
}

// ── 3. rewriteQuery (optional) ──────────────────────────────────────────────

/**
 * Rewrites a vague natural-language query into precise IS-standard keywords.
 * Falls back to the original query on failure — retrieval is never blocked.
 *
 * @param {string} query
 * @returns {Promise<string>}
 */
async function rewriteQuery(query) {
  if (!query?.trim()) return query;

  try {
    const rewritten = await _groqCall({
      systemPrompt:
        "You are a search query optimizer for the BIS SP-21 building materials standards database. " +
        "Convert the user's natural-language query into 3-6 precise technical keywords " +
        "suitable for searching Indian Standards (IS) documents. " +
        "Output ONLY the keywords separated by spaces — no explanation, no punctuation.",
      userMessage: query.trim(),
      maxTokens: 40,
      temperature: 0.1,
    });
    // Sanity check — if rewrite is too long or garbled, fall back
    const words = rewritten.trim().split(/\s+/);
    if (words.length >= 2 && words.length <= 10) return rewritten.trim();
    return query;
  } catch {
    return query;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildStandardContext(standard) {
  const parts = [`Standard: ${standard.standard_id} — ${standard.title}`];
  if (standard.category) parts.push(`Category: ${standard.category}`);
  if (standard.summary)  parts.push(`Summary: ${standard.summary}`);

  const sections = Object.entries(standard.key_sections || {}).slice(0, 3);
  if (sections.length) {
    parts.push("Key Sections:");
    for (const [name, text] of sections) {
      // Cap each section to 300 chars to keep token count low
      parts.push(`  ${name}: ${text.slice(0, 300)}`);
    }
  }
  return parts.join("\n");
}

module.exports = { generateExplanation, answerQuestion, rewriteQuery };
