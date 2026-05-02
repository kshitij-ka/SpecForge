import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./Navbar.css";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();

  const NAV_LINKS = [
    { label: t("nav.standards"), to: "/standards" },
    { label: t("nav.categories"), to: "/categories" },
    { label: t("nav.recommend"), to: "/recommend" },
    { label: t("nav.about"), to: "/about" },
  ];

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === "en" ? "hi" : "en");
  };

  return (
    <>
      <nav className="global-nav" role="navigation" aria-label={t("nav.brand") + " primary navigation"}>
        <div className="nav-inner">
          <Link className="nav-emblem" to="/" aria-label={t("nav.brand") + " home"} onClick={() => setOpen(false)}>
            <BISIcon />
            <span className="nav-brand">{t("nav.brand")}</span>
          </Link>

          <div className="nav-links" role="list">
            {NAV_LINKS.map(({ label, to }) => (
              <Link
                key={to}
                className={`nav-link${pathname === to ? " active" : ""}`}
                to={to}
                role="listitem"
              >
                {label}
              </Link>
            ))}
            <a
              className="nav-link"
              href="https://www.bis.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              role="listitem"
            >
              {t("nav.bisPortal")}
            </a>
            <button
              className="nav-link nav-lang-btn"
              onClick={toggleLang}
              aria-label={t("lang.switchTo")}
              title={t("lang.switchTo")}
            >
              {i18n.language === "en" ? t("lang.hi") : t("lang.en")}
            </button>
          </div>

          <button
            className="nav-hamburger"
            aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>

      {open && (
        <div className="mobile-menu" id="mobile-menu" role="menu">
          {NAV_LINKS.map(({ label, to }) => (
            <Link
              key={to}
              className="mobile-link"
              to={to}
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
          <a
            className="mobile-link"
            href="https://www.bis.gov.in"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            {t("nav.bisPortal")}
          </a>
          <button
            className="mobile-link nav-lang-btn"
            onClick={() => { toggleLang(); setOpen(false); }}
            role="menuitem"
          >
            {i18n.language === "en" ? t("lang.hi") : t("lang.en")}
          </button>
        </div>
      )}
    </>
  );
}

function BISIcon() {
  return (
    <svg className="emblem-icon" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="16" stroke="#FF9933" strokeWidth="2.5" />
      <circle cx="18" cy="18" r="6" fill="#FF9933" />
      <path d="M18 4v4M18 28v4M4 18h4M28 18h4" stroke="#FF9933" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.7 8.7l2.8 2.8M24.5 24.5l2.8 2.8M8.7 27.3l2.8-2.8M24.5 11.5l2.8-2.8"
        stroke="#FF9933" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
