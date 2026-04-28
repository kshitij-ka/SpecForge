import { useState, useRef } from "react";
import { recommend } from "../api/standards";
import StandardModal from "../components/StandardModal";
import "./Recommend.css";

export default function Recommend() {
  const [query, setQuery]         = useState("");
  const [rewrite, setRewrite]     = useState(false);
  const [results, setResults]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [selected, setSelected]   = useState(null);
  const inputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const data = await recommend({ query: q, top_n: 5, rewrite });
      setResults(data);
    } catch (err) {
      setError(err.message || "Something went wrong. Is the server running?");
    } finally {
      setLoading(false);
    }
  };

  const EXAMPLE_QUERIES = [
    "Requirements for ordinary portland cement 33 grade",
    "Specifications for structural steel in buildings",
    "Standards for pipes and fittings in plumbing",
    "Timber used in construction",
  ];

  return (
    <main className="recommend-page">
      {/* Header tile */}
      <section className="tile tile-dark rec-hero" aria-labelledby="rec-heading">
        <div className="tile-inner tile-center">
          <p className="tile-eyebrow">Hybrid Retrieval · AI Explanation</p>
          <h1 className="hero-display" id="rec-heading">Find & Understand Standards</h1>
          <p className="lead">
            Ask a natural language question — the system retrieves the most relevant
            IS standards using dense + sparse search, then explains each in plain English.
          </p>
        </div>
      </section>

      {/* Search tile */}
      <section className="tile tile-parchment" aria-label="Recommendation search">
        <div className="tile-inner">
          <form onSubmit={handleSubmit} role="search" aria-label="Recommend standards">
            <div className="rec-search-wrap">
              <SearchIcon />
              <input
                ref={inputRef}
                className="rec-search-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. What standard covers tensile strength of structural steel?"
                aria-label="Search query"
                maxLength={500}
                disabled={loading}
              />
              {query && !loading && (
                <button
                  type="button"
                  className="rec-clear"
                  onClick={() => { setQuery(""); setResults(null); inputRef.current?.focus(); }}
                  aria-label="Clear"
                >✕</button>
              )}
            </div>

            <div className="rec-options-row">
              <label className="rewrite-toggle" title="Let the AI rephrase your query into precise IS keywords before searching">
                <input
                  type="checkbox"
                  checked={rewrite}
                  onChange={(e) => setRewrite(e.target.checked)}
                  disabled={loading}
                />
                <span>Smart query rewrite</span>
                <span className="rewrite-hint">AI refines your query before searching</span>
              </label>
              <button
                className="btn-primary rec-submit"
                type="submit"
                disabled={!query.trim() || loading}
              >
                {loading ? <><SpinIcon /> Searching…</> : "Find Standards"}
              </button>
            </div>
          </form>

          {/* Example queries */}
          {!results && !loading && (
            <div className="example-queries" aria-label="Example queries">
              <p className="example-label">Try an example:</p>
              <div className="example-chips">
                {EXAMPLE_QUERIES.map((q) => (
                  <button
                    key={q}
                    className="example-chip"
                    onClick={() => { setQuery(q); setTimeout(() => inputRef.current?.focus(), 50); }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Results tile */}
      {(loading || results || error) && (
        <section className="tile tile-light results-section" aria-live="polite" aria-label="Results">
          <div className="tile-inner">
            {error && (
              <div className="error-banner" role="alert">
                <strong>Error:</strong> {error}
              </div>
            )}

            {loading && (
              <div className="loading-state" aria-label="Loading results">
                <div className="loading-steps">
                  <LoadingStep icon="🔍" label="Running hybrid retrieval (FAISS + BM25)…" />
                  <LoadingStep icon="✦"  label="Generating AI explanations…" delay />
                </div>
              </div>
            )}

            {results && !loading && (
              <>
                <div className="results-header">
                  <div>
                    <h2 className="results-title">
                      {results.standards.length} Standard{results.standards.length !== 1 ? "s" : ""} Found
                    </h2>
                    <p className="results-query">for: <em>{results.query}</em></p>
                  </div>
                  <div className="latency-badge" aria-label="Timing breakdown">
                    <LatencyBadge label="Retrieval" ms={results.latency.retrieval_ms} />
                    <LatencyBadge label="AI" ms={results.latency.llm_ms} accent />
                    <LatencyBadge label="Total" ms={results.latency.total_ms} bold />
                  </div>
                </div>

                <div className="rec-results-list" role="list">
                  {results.standards.map((s, i) => (
                    <RecommendCard
                      key={s.standard_id}
                      standard={s}
                      rank={i + 1}
                      onOpen={() => setSelected(standardsFullRecord(s))}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {selected && (
        <StandardModal standard={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function RecommendCard({ standard, rank, onOpen }) {
  return (
    <article
      className="rec-card"
      role="listitem"
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      tabIndex={0}
      aria-label={`Rank ${rank}: ${standard.standard_id}`}
    >
      <div className="rec-card-rank" aria-hidden="true">{rank}</div>

      <div className="rec-card-body">
        <div className="rec-card-meta">
          <span className="card-cat">{standard.category}</span>
          <span className="card-id">{standard.standard_id}</span>
          {standard.matched_section && (
            <span className="rec-card-section">§ {standard.matched_section}</span>
          )}
        </div>

        <h3 className="rec-card-title">{standard.title}</h3>

        {standard.explanation && (
          <div className="rec-card-explanation" aria-label="AI explanation">
            <span className="explanation-icon" aria-hidden="true">✦</span>
            <p className="explanation-text">{standard.explanation}</p>
          </div>
        )}

        {standard.keywords?.length > 0 && (
          <div className="card-keywords" aria-label="Keywords">
            {standard.keywords.slice(0, 5).map((kw) => (
              <span className="keyword-chip" key={kw}>{kw}</span>
            ))}
          </div>
        )}
      </div>

      <div className="rec-card-score" aria-label={`Relevance score ${standard.score}`}>
        <span className="score-num">{(standard.score * 100).toFixed(0)}</span>
        <span className="score-label">score</span>
      </div>

      <span className="rec-card-arrow" aria-hidden="true">→</span>
    </article>
  );
}

function LatencyBadge({ label, ms, accent, bold }) {
  return (
    <div className={`lat-badge${accent ? " lat-badge--accent" : ""}${bold ? " lat-badge--bold" : ""}`}>
      <span className="lat-ms">{ms}ms</span>
      <span className="lat-label">{label}</span>
    </div>
  );
}

function LoadingStep({ icon, label, delay }) {
  return (
    <div className={`loading-step${delay ? " loading-step--delay" : ""}`}>
      <span className="loading-step-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="rec-search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SpinIcon() {
  return <span className="spin-icon" aria-hidden="true">⟳</span>;
}

// Merge recommendation result with full standard record for the modal
function standardsFullRecord(s) {
  return {
    standard_id:  s.standard_id,
    title:        s.title,
    category:     s.category,
    summary:      s.explanation || "",
    keywords:     s.keywords || [],
    key_sections: {},
  };
}
