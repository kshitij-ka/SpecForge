import { Link } from "react-router-dom";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer" role="contentinfo">
      <div className="footer-inner">
        <div className="footer-cols">
          <div className="footer-col">
            <p className="footer-brand">BIS SP‑21</p>
            <p className="footer-tagline">
              Handbook on Building Materials<br />
              Special Publication 21 : 2005
            </p>
          </div>
          <div className="footer-col">
            <p className="footer-heading">Portal</p>
            <Link className="footer-link" to="/standards">Search Standards</Link>
            <Link className="footer-link" to="/categories">Browse Categories</Link>
            <Link className="footer-link" to="/about">About</Link>
          </div>
          <div className="footer-col">
            <p className="footer-heading">Bureau of Indian Standards</p>
            <a className="footer-link" href="https://www.bis.gov.in" target="_blank" rel="noopener noreferrer">BIS Official Website</a>
            <a className="footer-link" href="https://www.manakonline.in" target="_blank" rel="noopener noreferrer">Manak Online</a>
            <a className="footer-link" href="https://standardsbis.bsbedge.com" target="_blank" rel="noopener noreferrer">Standards Portal</a>
          </div>
          <div className="footer-col">
            <p className="footer-heading">Ministry</p>
            <a className="footer-link" href="https://dpiit.gov.in" target="_blank" rel="noopener noreferrer">DPIIT</a>
            <a className="footer-link" href="https://www.india.gov.in" target="_blank" rel="noopener noreferrer">National Portal</a>
          </div>
        </div>
        <div className="footer-legal">
          <p>© Bureau of Indian Standards, Ministry of Commerce & Industry, Government of India. All rights reserved.</p>
          <p>Content sourced from BIS Special Publication 21 : 2005. For official standards, refer to{" "}
            <a href="https://www.bis.gov.in" target="_blank" rel="noopener noreferrer" className="legal-link">bis.gov.in</a>.
          </p>
        </div>
      </div>
    </footer>
  );
}
