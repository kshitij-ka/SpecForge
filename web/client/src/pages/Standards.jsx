import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchStandards, fetchCategories } from "../api/standards";
import StandardCard from "../components/StandardCard";
import StandardModal from "../components/StandardModal";
import { useDebounce } from "../hooks/useDebounce";
import "./Standards.css";

const PAGE_SIZE = 18;

export default function Standards() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const debouncedQuery = useDebounce(query, 350);
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
      setError(t("standards.serverError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => {});
    load(debouncedQuery, category, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(debouncedQuery, category, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  useEffect(() => {
    const params = {};
    if (debouncedQuery) params.q = debouncedQuery;
    if (category) params.category = category;
    setSearchParams(params, { replace: true });
  }, [debouncedQuery, category, setSearchParams]);

  const handleCategoryChange = (value) => {
    setCategory(value);
    load(debouncedQuery, value, 1);
  };

  const handlePageChange = (pg) => {
    load(debouncedQuery, category, pg);
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
          <h1 className="display-lg" id="search-heading">{t("standards.heading")}</h1>
          <p className="lead-sub">{t("standards.lead")}</p>

          <form className="search-form" role="search" onSubmit={(e) => e.preventDefault()}>
            <div className="search-wrap">
              <SearchIcon />
              <input
                className="search-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("standards.searchPlaceholder")}
                aria-label={t("standards.searchLabel")}
              />
              {query && (
                <button
                  className="search-clear"
                  type="button"
                  onClick={handleClearSearch}
                  aria-label={t("standards.clearSearch")}
                />
              )}
            </div>
            <div className="filter-row">
              <select
                className="category-filter"
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                aria-label={t("standards.categoryFilter")}
              >
                <option value="">{t("standards.allCategories")}</option>
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
              {loading
                ? t("standards.searching")
                : t("standards.found", { count: meta.total })}
              {!loading && meta.total > 0 && ` -- ${t("standards.page", { page: meta.page, total: meta.totalPages })}`}
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
              <p className="empty-title">{t("standards.noResultsTitle")}</p>
              <p className="empty-sub">{t("standards.noResultsSub")}</p>
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
            <nav className="pagination" aria-label={t("standards.pagination")}>
              <button
                className="page-btn"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
                aria-label={t("standards.prevPage")}
              >
                ← {t("standards.prevPage")}
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
                      aria-label={t("standards.pageLabel", { page: p })}
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
                aria-label={t("standards.nextPage")}
              >
                {t("standards.nextPage")} →
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
