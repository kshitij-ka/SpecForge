import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./Footer.css";

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="footer" role="contentinfo">
      <div className="footer-inner">
        <div className="footer-cols">
          <div className="footer-col">
            <p className="footer-brand">{t("footer.brand")}</p>
            <p className="footer-tagline">{t("footer.tagline")}</p>
          </div>
          <div className="footer-col">
            <p className="footer-heading">{t("footer.portal")}</p>
            <Link className="footer-link" to="/standards">{t("footer.searchStandards")}</Link>
            <Link className="footer-link" to="/categories">{t("footer.browseCategories")}</Link>
            <Link className="footer-link" to="/about">{t("footer.about")}</Link>
          </div>
          <div className="footer-col">
            <p className="footer-heading">{t("footer.bis")}</p>
            <a className="footer-link" href="https://www.bis.gov.in" target="_blank" rel="noopener noreferrer">{t("footer.bisWebsite")}</a>
            <a className="footer-link" href="https://www.manakonline.in" target="_blank" rel="noopener noreferrer">{t("footer.manakOnline")}</a>
            <a className="footer-link" href="https://standardsbis.bsbedge.com" target="_blank" rel="noopener noreferrer">{t("footer.standardsPortal")}</a>
          </div>
          <div className="footer-col">
            <p className="footer-heading">{t("footer.ministry")}</p>
            <a className="footer-link" href="https://dpiit.gov.in" target="_blank" rel="noopener noreferrer">{t("footer.dpiit")}</a>
            <a className="footer-link" href="https://www.india.gov.in" target="_blank" rel="noopener noreferrer">{t("footer.nationalPortal")}</a>
          </div>
        </div>
        <div className="footer-legal">
          <p>{t("footer.copyright")}</p>
          <p>{t("footer.sourceNote")}{" "}
            <a href="https://www.bis.gov.in" target="_blank" rel="noopener noreferrer" className="legal-link">bis.gov.in</a>.
          </p>
        </div>
      </div>
    </footer>
  );
}
