import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchStats, fetchCategories } from "../api/standards";
import "./Home.css";

export default function Home() {
  const { t } = useTranslation();
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

  const PILLARS = [
    { icon: "⚡", titleKey: "home.pillar_instantRetrieval_title", bodyKey: "home.pillar_instantRetrieval_body" },
    { icon: "📐", titleKey: "home.pillar_sectionDetail_title",    bodyKey: "home.pillar_sectionDetail_body" },
    { icon: "🗂",  titleKey: "home.pillar_categories_title",       bodyKey: "home.pillar_categories_body" },
    { icon: "🔒", titleKey: "home.pillar_officialSource_title",   bodyKey: "home.pillar_officialSource_body" },
  ];

  return (
    <main>
      <section className="tile tile-dark hero-tile" aria-labelledby="hero-heading">
        <div className="tile-inner tile-center">
          <p className="tile-eyebrow">{t("home.eyebrow")}</p>
          <h1 className="hero-display" id="hero-heading">
            {t("home.heroTitle").split("\n").map((line, i, arr) => (
              <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
            ))}
          </h1>
          <p className="lead">{t("home.heroLead")}</p>

          <form className="hero-search-form" onSubmit={handleSearch} role="search">
            <div className="hero-search-wrap">
              <SearchIcon />
              <input
                className="hero-search-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("home.searchPlaceholder")}
                aria-label={t("home.searchLabel")}
              />
              <button className="btn-primary hero-search-btn" type="submit">{t("home.searchBtn")}</button>
            </div>
          </form>

          {stats && (
            <div className="hero-stats" aria-label={t("home.statsLabel")}>
              <div className="stat">
                <span className="stat-num">{stats.totalStandards}</span>
                <span className="stat-label">{t("home.statStandards")}</span>
              </div>
              <div className="stat-divider" aria-hidden="true" />
              <div className="stat">
                <span className="stat-num">{stats.totalCategories}</span>
                <span className="stat-label">{t("home.statCategories")}</span>
              </div>
              <div className="stat-divider" aria-hidden="true" />
              <div className="stat">
                <span className="stat-num">929</span>
                <span className="stat-label">{t("home.statPages")}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="tile tile-parchment" id="categories" aria-labelledby="cat-heading">
        <div className="tile-inner">
          <div className="section-header">
            <h2 className="display-lg" id="cat-heading">{t("home.categoriesHeading")}</h2>
            <p className="lead-sub">{t("home.categoriesLead")}</p>
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
                <span className="cat-count">{t("home.standardCount", { count: cat.count })}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="tile tile-dark-2" aria-labelledby="about-strip-heading">
        <div className="tile-inner">
          <div className="feature-cols">
            <div className="feature-text">
              <p className="tile-eyebrow">{t("home.aboutEyebrow")}</p>
              <h2 className="display-md" id="about-strip-heading">{t("home.aboutHeading")}</h2>
              <p className="body-copy">{t("home.aboutBody")}</p>
              <a
                className="btn-primary-on-dark"
                href="https://www.bis.gov.in"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("home.visitBIS")}
              </a>
            </div>
            <div className="feature-pillars" role="list">
              {PILLARS.map(({ icon, titleKey, bodyKey }) => (
                <div className="pillar" role="listitem" key={titleKey}>
                  <span className="pillar-icon" aria-hidden="true">{icon}</span>
                  <h3 className="pillar-title">{t(titleKey)}</h3>
                  <p className="pillar-body">{t(bodyKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
