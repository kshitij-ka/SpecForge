import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchStats, fetchCategories } from "../api/standards";
import "./Home.css";

export default function Home() {
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
    fetchCategories().then(setCategories).catch(() => {});
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) navigate(`/standards?q=${encodeURIComponent(query.trim())}`);
    else navigate("/standards");
  };

  return (
    <main>
      {/* Hero */}
      <section className="tile tile-dark hero-tile" aria-labelledby="hero-heading">
        <div className="tile-inner tile-center">
          <p className="tile-eyebrow">Special Publication 21 · 2005</p>
          <h1 className="hero-display" id="hero-heading">
            Handbook of<br />Building Materials
          </h1>
          <p className="lead">
            Indian Standards across 25 material categories —<br className="desktop-only" />
            searchable, categorised, and ready to reference.
          </p>

          <form className="hero-search-form" onSubmit={handleSearch} role="search">
            <div className="hero-search-wrap">
              <SearchIcon />
              <input
                className="hero-search-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search standards, e.g. Portland Cement, IS 269…"
                aria-label="Search standards"
              />
              <button className="btn-primary hero-search-btn" type="submit">Search</button>
            </div>
          </form>

          {stats && (
            <div className="hero-stats" aria-label="Key statistics">
              <div className="stat">
                <span className="stat-num">{stats.totalStandards}</span>
                <span className="stat-label">IS Standards</span>
              </div>
              <div className="stat-divider" aria-hidden="true" />
              <div className="stat">
                <span className="stat-num">{stats.totalCategories}</span>
                <span className="stat-label">Categories</span>
              </div>
              <div className="stat-divider" aria-hidden="true" />
              <div className="stat">
                <span className="stat-num">929</span>
                <span className="stat-label">Pages Indexed</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Categories */}
      <section className="tile tile-parchment" id="categories" aria-labelledby="cat-heading">
        <div className="tile-inner">
          <div className="section-header">
            <h2 className="display-lg" id="cat-heading">25 Material Categories</h2>
            <p className="lead-sub">Every building material section from SP‑21, indexed and searchable.</p>
          </div>
          <div className="category-grid" role="list">
            {categories.map((cat) => (
              <button
                key={cat.name}
                className="cat-card"
                role="listitem"
                onClick={() => navigate(`/standards?category=${encodeURIComponent(cat.name)}`)}
              >
                <span className="cat-name">{cat.name}</span>
                <span className="cat-count">{cat.count} standard{cat.count !== 1 ? "s" : ""}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* About strip */}
      <section className="tile tile-dark-2" aria-labelledby="about-heading">
        <div className="tile-inner">
          <div className="feature-cols">
            <div className="feature-text">
              <p className="tile-eyebrow">About SP‑21</p>
              <h2 className="display-md" id="about-heading">
                India's Reference for Building Material Standards
              </h2>
              <p className="body-copy">
                BIS Special Publication 21 consolidates all Indian Standards relevant to building and
                construction materials — from Portland cement to wire ropes, sanitary fittings to structural
                steels. Published by the Bureau of Indian Standards, it is the authoritative handbook used
                by architects, structural engineers, contractors, and quality inspectors across India.
              </p>
              <a
                className="btn-primary-on-dark"
                href="https://www.bis.gov.in"
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit BIS Portal ↗
              </a>
            </div>
            <div className="feature-pillars" role="list">
              {PILLARS.map(({ icon, title, body }) => (
                <div className="pillar" role="listitem" key={title}>
                  <span className="pillar-icon" aria-hidden="true">{icon}</span>
                  <h3 className="pillar-title">{title}</h3>
                  <p className="pillar-body">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const PILLARS = [
  { icon: "⚡", title: "Instant Retrieval", body: "Full-text search across all 573 standards with ranked results." },
  { icon: "📐", title: "Section-Level Detail", body: "Scope, requirements, delivery conditions — all structured fields." },
  { icon: "🗂", title: "25 Categories", body: "Organised by BIS material sections, mirroring SP‑21's own structure." },
  { icon: "🔒", title: "Official Source", body: "Parsed directly from the BIS SP‑21 : 2005 authoritative edition." },
];

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
