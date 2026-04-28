import "./About.css";

export default function About() {
  return (
    <main>
      <section className="tile tile-dark about-hero" aria-labelledby="about-heading">
        <div className="tile-inner tile-center">
          <p className="tile-eyebrow">Bureau of Indian Standards</p>
          <h1 className="hero-display" id="about-heading">About BIS SP‑21</h1>
          <p className="lead">
            India's authoritative handbook on building and construction material standards.
          </p>
        </div>
      </section>

      <section className="tile tile-light" aria-label="About the publication">
        <div className="tile-inner about-content">
          <div className="about-main">
            <h2 className="about-section-title">What is SP‑21?</h2>
            <p className="about-body">
              BIS Special Publication 21 — <em>Handbook on Building Materials</em> — is a consolidated
              reference published by the Bureau of Indian Standards. It brings together all Indian
              Standards relevant to construction and building materials into a single, organised document.
            </p>
            <p className="about-body">
              The 2005 edition (the basis of this portal) spans 929 pages across 25 material sections,
              covering everything from cement and structural steel to timber, paints, sanitary fittings,
              wire ropes, and thermal insulation.
            </p>

            <h2 className="about-section-title">Who uses it?</h2>
            <p className="about-body">
              SP‑21 is used daily by structural engineers specifying materials, architects selecting
              finishes, contractors verifying supplier compliance, quality inspectors conducting audits,
              and procurement officers evaluating bids. It is the single source of truth for which IS
              standard governs a given building product.
            </p>

            <h2 className="about-section-title">About this portal</h2>
            <p className="about-body">
              This portal parses the SP‑21 : 2005 source document into 573 discrete IS standards with
              structured fields — standard ID, title, material category, scope summary, key sections
              (Requirements, Delivery, Manufacture, etc.), and TF-IDF keywords. Every record is
              full-text searchable and filterable by category.
            </p>
            <p className="about-body">
              The parser uses a two-pass boundary detection algorithm to split the PDF's continuous
              text into individual standards, with deduplication, section normalisation, and
              contamination detection to ensure clean, reliable data.
            </p>
          </div>

          <aside className="about-sidebar">
            <div className="about-stat-card">
              <h3 className="sidebar-heading">Publication Details</h3>
              <dl className="detail-list">
                <dt>Publisher</dt><dd>Bureau of Indian Standards</dd>
                <dt>Edition</dt><dd>SP 21 : 2005</dd>
                <dt>Pages</dt><dd>929</dd>
                <dt>Standards indexed</dt><dd>573</dd>
                <dt>Categories</dt><dd>25</dd>
                <dt>Ministry</dt><dd>DPIIT, Govt. of India</dd>
              </dl>
            </div>
            <div className="about-links-card">
              <h3 className="sidebar-heading">Official Links</h3>
              <a className="ext-link" href="https://www.bis.gov.in" target="_blank" rel="noopener noreferrer">
                <span>BIS Official Website</span><span aria-hidden="true">↗</span>
              </a>
              <a className="ext-link" href="https://www.manakonline.in" target="_blank" rel="noopener noreferrer">
                <span>Manak Online</span><span aria-hidden="true">↗</span>
              </a>
              <a className="ext-link" href="https://standardsbis.bsbedge.com" target="_blank" rel="noopener noreferrer">
                <span>Standards Portal</span><span aria-hidden="true">↗</span>
              </a>
              <a className="ext-link" href="https://dpiit.gov.in" target="_blank" rel="noopener noreferrer">
                <span>DPIIT</span><span aria-hidden="true">↗</span>
              </a>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
