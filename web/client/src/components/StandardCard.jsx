import { useTranslation } from "react-i18next";
import "./StandardCard.css";

export default function StandardCard({ standard, onClick }) {
  const { t } = useTranslation();
  const sectionCount = Object.keys(standard.key_sections || {}).length;

  return (
    <article
      className="result-card"
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      tabIndex={0}
      role="button"
      aria-label={t("card.viewDetails", { id: standard.standard_id })}
    >
      <span className="card-cat">{standard.category}</span>
      <p className="card-id">{standard.standard_id}</p>
      <h3 className="card-title">{standard.title}</h3>
      {standard.summary && (
        <p className="card-summary">{standard.summary}</p>
      )}
      {standard.keywords?.length > 0 && (
        <div className="card-keywords" aria-label={t("card.keywords")}>
          {standard.keywords.slice(0, 5).map((kw) => (
            <span className="keyword-chip" key={kw}>{kw}</span>
          ))}
        </div>
      )}
      <div className="card-footer">
        <span className="card-sections-count">
          {t("card.section", { count: sectionCount })}
        </span>
        <span className="card-arrow" aria-hidden="true">→</span>
      </div>
    </article>
  );
}
