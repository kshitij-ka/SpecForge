import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Navbar.css";

const NAV_LINKS = [
  { label: "Standards", to: "/standards" },
  { label: "Categories", to: "/categories" },
  { label: "✦ AI Recommend", to: "/recommend" },
  { label: "About", to: "/about" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <>
      <nav className="global-nav" role="navigation" aria-label="Primary navigation">
        <div className="nav-inner">
          <Link className="nav-emblem" to="/" aria-label="BIS SP-21 home" onClick={() => setOpen(false)}>
            <BISIcon />
            <span className="nav-brand">BIS SP‑21</span>
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
              BIS Portal ↗
            </a>
          </div>

          <button
            className="nav-hamburger"
            aria-label={open ? "Close menu" : "Open menu"}
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
            BIS Portal ↗
          </a>
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
