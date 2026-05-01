import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchStandards, fetchCategories } from "../api/standards";
import StandardCard from "../components/StandardCard";
import StandardModal from "../components/StandardModal";
import "./Standards.css";

const PAGE_SIZE = 18;

/**
 * Standards search page with pagination.
 * Uses URL search params for query/category state.
 * Loads standards on mount and handles user interactions.
 */
export default function Standards() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [page, setPage] = useState(1);

  const [results, setResults] = useState([]);
  const [meta, setMeta] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (q, cat, pg) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStandards({ q, category: cat, page: pg, limit: PAGE_SIZE });
      setResults(data.data);
      setMeta(data.meta);
      setPage(pg);
    } catch {
      setError("Could not load standards. Is the server running?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
    load(query, category, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = {};
    if (query) params.q = query;
    if (category) params.category = category;
    setSearchParams(params, { replace: true });
  }, [query, category, setSearchParams]);

  const handleCategoryChange = (value) => {
    setCategory(value);
    load(query, value, 1);
  };

  const handlePageChange = (pg) => {
    load(query, category, pg);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClearSearch = () => {
    setQuery("");
    setCategory("");
    load("", "", 1);
  };

  return (
    <main className="standards-page">
      <section className="tile tile-parchment search-tile" aria-labelledby="search-heading">
        <div className="tile-inner">
          <h1 className="display-lg" id="search-heading">Find an IS Standard</h1>
          <p className="lead-sub">Search by standard number, title, material, or keyword.</p>

          <form className="search-form" role="search" onSubmit={(e) => e.preventDefault()}>
            <div className="search-wrap">
              <SearchIcon />
              <input
                className="search-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Ordinary Portland Cement, IS 269, aggregates…"
                aria-label="Search standards"
              />
              {query && (
                <button
                  className="search-clear"
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="filter-row">
              <select
                className="category-filter"
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                aria-label="Filter by category"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.count})
                  </option>
                ))}
              </select>
            </div>
          </form>
        </div>
      </section>

      <section className="tile tile-light results-tile" aria-live="polite" aria-atomic="false">
        <div className="tile-inner">
          {error && <div className="error-banner" role="alert">{error}</div>}

          {!error && meta && (
            <p className="results-meta">
              {loading ? "Searching…" : `${meta.total} standard${meta.total !== 1 ? "s" : ""} found`}
              {meta.total > 0 && ` — page ${meta.page} of ${meta.totalPages}`}
            </p>
          )}

          {loading && results.length === 0 && (
            <div className="results-skeleton">
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="skeleton-card" key={i} aria-hidden="true" />
              ))}
            </div>
          )}

          {!loading && results.length === 0 && !error && (
            <div className="results-empty">
              <p className="empty-title">No standards found</p>
              <p className="empty-sub">Try a different keyword or clear the category filter.</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="results-grid">
              {results.map((s) => (
                <StandardCard
                  key={s.standard_id}
                  standard={s}
                  onClick={() => setSelected(s)}
                />
              ))}
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <nav className="pagination" aria-label="Results pagination">
              <button
                className="page-btn"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
                aria-label="Previous page"
              >
                ← Prev
              </button>
              <div className="page-numbers">
                {buildPageRange(page, meta.totalPages).map((p, i) =>
                  p === "…" ? (
                    <span key={`ellipsis-${i}`} className="page-ellipsis">…</span>
                  ) : (
                    <button
                      key={p}
                      className={`page-btn${p === page ? " active" : ""}`}
                      onClick={() => handlePageChange(p)}
                      aria-label={`Page ${p}`}
                      aria-current={p === page ? "page" : undefined}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>
              <button
                className="page-btn"
                disabled={page >= meta.totalPages}
                onClick={() => handlePageChange(page + 1)}
                aria-label="Next page"
              >
                Next →
              </button>
            </nav>
          )}
        </div>
      </section>

      {selected && (
        <StandardModal standard={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}

function buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1].filter(p => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
}

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}