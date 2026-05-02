import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchCategories } from "../api/standards";
import "./Categories.css";

const CATEGORY_ICONS = {
  "Adhesives": "🧲",
  "Bitumen and Tar Products": "🛣️",
  "Builder's Hardware": "🔩",
  "Building Limes": "🪨",
  "Cement and Concrete": "🏗️",
  "Concrete Reinforcement": "⚙️",
  "Doors, Windows and Shutters": "🚪",
  "Electrical Installations": "⚡",
  "Floor, Wall, Roof Coverings and Finishes": "🏛️",
  "Gypsum Building Materials": "🏺",
  "Light Metal and Their Alloys": "🔧",
  "Paints, Varnishes and Allied Products": "🎨",
  "Pipes and Fittings": "🔧",
  "Sanitary Appliances and Water Fittings": "🚿",
  "Stones": "🪨",
  "Structural Shapes": "📐",
  "Structural Steels": "🏗️",
  "Thermal Insulation Materials": "🌡️",
  "Threaded Fasteners and Rivets": "🔩",
  "Timber": "🪵",
  "Water Proofing and Damp Proofing Materials": "💧",
  "Welding Electrodes and Wires": "🔌",
  "Wire Ropes and Wire Products": "🪢",
  "Wood Products": "🪵",
  "Wood Products for Building": "🏠",
};

export default function Categories() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const total = categories.reduce((s, c) => s + c.count, 0);

  return (
    <main>
      <section className="tile tile-dark cat-hero" aria-labelledby="cat-page-heading">
        <div className="tile-inner tile-center">
          <p className="tile-eyebrow">{t("categories.eyebrow")}</p>
          <h1 className="hero-display" id="cat-page-heading">{t("categories.heading")}</h1>
          <p className="lead">
            {t("categories.lead", { count: categories.length, total })}
          </p>
        </div>
      </section>

      <section className="tile tile-light" aria-label={t("categories.allLabel")}>
        <div className="tile-inner">
          {loading ? (
            <div className="cat-skeleton">
              {Array.from({ length: 12 }).map((_, i) => (
                <div className="skeleton-card" key={i} aria-hidden="true" />
              ))}
            </div>
          ) : (
            <div className="cat-page-grid" role="list">
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  className="cat-page-card"
                  role="listitem"
                  onClick={() => navigate(`/standards?category=${encodeURIComponent(cat.name)}`)}
                >
                  <span className="cat-page-icon" aria-hidden="true">
                    {CATEGORY_ICONS[cat.name] || "📋"}
                  </span>
                  <span className="cat-page-name">{cat.name}</span>
                  <span className="cat-page-count">{t("categories.standardCount", { count: cat.count })}</span>
                  <span className="cat-page-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
