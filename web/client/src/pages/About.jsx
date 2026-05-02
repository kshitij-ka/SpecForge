import { useTranslation } from "react-i18next";
import "./About.css";

export default function About() {
  const { t } = useTranslation();

  return (
    <main>
      <section className="tile tile-dark about-hero" aria-labelledby="about-heading">
        <div className="tile-inner tile-center">
          <p className="tile-eyebrow">{t("about.eyebrow")}</p>
          <h1 className="hero-display" id="about-heading">{t("about.heading")}</h1>
          <p className="lead">{t("about.lead")}</p>
        </div>
      </section>

      <section className="tile tile-light" aria-label={t("about.aboutLabel")}>
        <div className="tile-inner about-content">
          <div className="about-main">
            <h2 className="about-section-title">{t("about.whatTitle")}</h2>
            <p className="about-body">{t("about.whatBody1")}</p>
            <p className="about-body">{t("about.whatBody2")}</p>

            <h2 className="about-section-title">{t("about.whoTitle")}</h2>
            <p className="about-body">{t("about.whoBody")}</p>

            <h2 className="about-section-title">{t("about.portalTitle")}</h2>
            <p className="about-body">{t("about.portalBody1")}</p>
            <p className="about-body">{t("about.portalBody2")}</p>
          </div>

          <aside className="about-sidebar">
            <div className="about-stat-card">
              <h3 className="sidebar-heading">{t("about.sidebarPubDetails")}</h3>
              <dl className="detail-list">
                <dt>{t("about.publisher")}</dt><dd>{t("about.publisherValue")}</dd>
                <dt>{t("about.edition")}</dt><dd>{t("about.editionValue")}</dd>
                <dt>{t("about.pages")}</dt><dd>{t("about.pagesValue")}</dd>
                <dt>{t("about.standardsIndexed")}</dt><dd>{t("about.standardsIndexedValue")}</dd>
                <dt>{t("about.categoriesLabel")}</dt><dd>{t("about.categoriesValue")}</dd>
                <dt>{t("about.ministry")}</dt><dd>{t("about.ministryValue")}</dd>
              </dl>
            </div>
            <div className="about-links-card">
              <h3 className="sidebar-heading">{t("about.officialLinks")}</h3>
              <a className="ext-link" href="https://www.bis.gov.in" target="_blank" rel="noopener noreferrer">
                <span>{t("about.bisWebsite")}</span><span aria-hidden="true">↗</span>
              </a>
              <a className="ext-link" href="https://www.manakonline.in" target="_blank" rel="noopener noreferrer">
                <span>{t("about.manakOnline")}</span><span aria-hidden="true">↗</span>
              </a>
              <a className="ext-link" href="https://standardsbis.bsbedge.com" target="_blank" rel="noopener noreferrer">
                <span>{t("about.standardsPortal")}</span><span aria-hidden="true">↗</span>
              </a>
              <a className="ext-link" href="https://dpiit.gov.in" target="_blank" rel="noopener noreferrer">
                <span>{t("about.dpiit")}</span><span aria-hidden="true">↗</span>
              </a>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
