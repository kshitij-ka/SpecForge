import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { recommend } from "../api/standards";
import StandardModal from "../components/StandardModal";
import "./Recommend.css";

export default function Recommend() {
  const { t } = useTranslation();
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
      setError(err.message || t("common.serverError"));
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
      <section className="tile tile-dark rec-hero" aria-labelledby="rec-heading">
        <div className="tile-inner tile-center">
          <p className="tile-eyebrow">{t("recommend.eyebrow")}</p>
          <h1 className="hero-display" id="rec-heading">{t("recommend.heading")}</h1>
          <p className="lead">{t("recommend.lead")}</p>
        </div>
      </section>

      <section className="tile tile-parchment" aria-label={t("recommend.eyebrow")}>
        <div className="tile-inner">
          <form onSubmit={handleSubmit} role="search" aria-label={t("recommend.heading")}>
            <div className="rec-search-wrap">
              <SearchIcon />
              <input
                ref={inputRef}
                className="rec-search-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("recommend.searchPlaceholder")}
                aria-label={t("recommend.searchLabel")}
                maxLength={500}
                disabled={loading}
              />
              {query && !loading && (
                <button
                  type="button"
                  className="rec-clear"
                  onClick={() => { setQuery(""); setResults(null); inputRef.current?.focus(); }}
                  aria-label={t("recommend.clearBtn")}
                >✕</button>
              )}
            </div>

            <div className="rec-options-row">
              <label className="rewrite-toggle" title={t("recommend.rewriteHint")}>
                <input
                  type="checkbox"
                  checked={rewrite}
                  onChange={(e) => setRewrite(e.target.checked)}
                  disabled={loading}
                />
                <span>{t("recommend.rewriteLabel")}</span>
                <span className="rewrite-hint">{t("recommend.rewriteHint")}</span>
              </label>
              <button
                className="btn-primary rec-submit"
                type="submit"
                disabled={!query.trim() || loading}
              >
                {loading ? <><SpinIcon /> {t("recommend.submitting")}</> : t("recommend.submitBtn")}
              </button>
            </div>
          </form>

          {!results && !loading && (
            <div className="example-queries" aria-label={t("recommend.exampleLabel")}>
              <p className="example-label">{t("recommend.exampleLabel")}</p>
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

      {(loading || results || error) && (
        <section className="tile tile-light results-section" aria-live="polite" aria-label={t("recommend.heading")}>
          <div className="tile-inner">
            {error && (
              <div className="error-banner" role="alert">
                <strong>{t("recommend.error_prefix")}</strong> {error}
              </div>
            )}

            {loading && (
              <div className="loading-state" aria-label={t("common.loading")}>
                <div className="loading-steps">
                  <LoadingStep icon="🔍" label={t("recommend.loadingRetrieval")} />
                  <LoadingStep icon="✦"  label={t("recommend.loadingAI")} delay />
                </div>
              </div>
            )}

            {results && !loading && (
              <>
                <div className="results-header">
                  <div>
                    <h2 className="results-title">
                      {t("recommend.resultsFound", { count: results.standards.length })}
                    </h2>
                    <p className="results-query">{t("recommend.resultsFor")} <em>{results.query}</em></p>
                  </div>
                  <div className="latency-badge" aria-label={t("recommend.timingLabel")}>
                    <LatencyBadge label={t("recommend.retrieval")} ms={results.latency.retrieval_ms} />
                    <LatencyBadge label={t("recommend.ai")}        ms={results.latency.llm_ms}       accent />
                    <LatencyBadge label={t("recommend.total")}     ms={results.latency.total_ms}     bold />
                  </div>
                </div>

                <div className="rec-results-list" role="list">
                  {results.standards.map((s, i) => (
                    <RecommendCard
                      key={s.standard_id}
                      standard={s}
                      rank={i + 1}
                      onOpen={() => setSelected(standardsFullRecord(s))}
                      t={t}
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

function RecommendCard({ standard, rank, onOpen, t }) {
  return (
    <article
      className="rec-card"
      role="listitem"
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      tabIndex={0}
      aria-label={t("recommend.rankLabel", { rank, id: standard.standard_id })}
    >
      <div className="rec-card-rank" aria-hidden="true">{rank}</div>

      <div className="rec-card-body">
        <div className="rec-card-meta">
          <span className="card-cat">{standard.category}</span>
          <span className="card-id">{standard.standard_id}</span>
          {standard.matched_section && (
            <span className="rec-card-section">{t("recommend.section", { section: standard.matched_section })}</span>
          )}
        </div>

        <h3 className="rec-card-title">{standard.title}</h3>

        {standard.explanation && (
          <div className="rec-card-explanation" aria-label={t("recommend.aiExplanation")}>
            <span className="explanation-icon" aria-hidden="true">✦</span>
            <p className="explanation-text">{standard.explanation}</p>
          </div>
        )}

        {standard.keywords?.length > 0 && (
          <div className="card-keywords" aria-label={t("recommend.keywords")}>
            {standard.keywords.slice(0, 5).map((kw) => (
              <span className="keyword-chip" key={kw}>{kw}</span>
            ))}
          </div>
        )}
      </div>

      <div className="rec-card-score" aria-label={t("recommend.relevanceScore", { score: standard.score })}>
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
