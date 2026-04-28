import { useEffect, useRef, useState } from "react";
import { askQuestion } from "../api/standards";
import "./StandardModal.css";

export default function StandardModal({ standard, onClose }) {
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);
  const inputRef = useRef(null);

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]); // [{role, text}]
  const [asking, setAsking] = useState(false);
  const [aiError, setAiError] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setAsking(true);
    setAiError(null);

    try {
      const { answer } = await askQuestion({ standard_id: standard.standard_id, question: q });
      setMessages((prev) => [...prev, { role: "ai", text: answer }]);
    } catch (err) {
      setAiError(err.message || "Something went wrong. Please try again.");
    } finally {
      setAsking(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  if (!standard) return null;

  const sections = Object.entries(standard.key_sections || {});

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={handleBackdrop}
    >
      <div
        className="modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <span className="modal-eyebrow">{standard.category}</span>
            <h2 className="modal-title" id="modal-title">{standard.title}</h2>
            <span className="modal-id">{standard.standard_id}</span>
          </div>
          <button
            className="modal-close"
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close standard detail"
          >
            ✕
          </button>
        </div>

        {/* Standard detail */}
        <div className="modal-body">
          {standard.summary && (
            <div className="modal-section">
              <p className="modal-section-title">Summary</p>
              <p className="modal-section-body">{standard.summary}</p>
            </div>
          )}

          {standard.keywords?.length > 0 && (
            <div className="modal-section">
              <p className="modal-section-title">Keywords</p>
              <div className="modal-keywords">
                {standard.keywords.map((kw) => (
                  <span className="modal-keyword" key={kw}>{kw}</span>
                ))}
              </div>
            </div>
          )}

          {sections.length > 0 && (
            <div className="modal-section">
              <p className="modal-section-title">Key Sections</p>
              <div className="modal-key-sections">
                {sections.map(([name, text]) => (
                  <div className="key-section-item" key={name}>
                    <p className="key-section-name">{name}</p>
                    <p className="key-section-text">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI chat panel */}
          <div className="modal-section ai-panel" aria-label="Ask AI about this standard">
            <p className="modal-section-title">
              <span className="ai-label-icon" aria-hidden="true">✦</span>
              Ask AI about this standard
            </p>

            {messages.length > 0 && (
              <div className="chat-log" aria-live="polite" aria-label="Conversation">
                {messages.map((m, i) => (
                  <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
                    {m.role === "ai" && (
                      <span className="bubble-label" aria-label="AI response">✦</span>
                    )}
                    <p className="bubble-text">{m.text}</p>
                  </div>
                ))}
                {asking && (
                  <div className="chat-bubble chat-bubble--ai chat-bubble--loading" aria-label="AI is thinking">
                    <span className="bubble-label" aria-hidden="true">✦</span>
                    <span className="typing-dots">
                      <span /><span /><span />
                    </span>
                  </div>
                )}
                {aiError && (
                  <p className="chat-error" role="alert">{aiError}</p>
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            {messages.length === 0 && !asking && (
              <div className="chat-suggestions" aria-label="Suggested questions">
                {getSuggestions(standard).map((s) => (
                  <button
                    key={s}
                    className="suggestion-chip"
                    onClick={() => {
                      setQuestion(s);
                      setTimeout(() => inputRef.current?.focus(), 50);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form className="chat-form" onSubmit={handleAsk} aria-label="Ask a question">
              <input
                ref={inputRef}
                className="chat-input"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about this standard…"
                maxLength={500}
                disabled={asking}
                aria-label="Your question"
              />
              <button
                className="chat-send"
                type="submit"
                disabled={!question.trim() || asking}
                aria-label="Send question"
              >
                {asking ? "…" : "Ask"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function getSuggestions(standard) {
  const base = [
    `What are the key requirements of ${standard.standard_id}?`,
    "What materials or tests are specified?",
    "What are the delivery or packaging specifications?",
  ];
  if (standard.key_sections?.["Chemical Requirements"]) {
    base.splice(1, 0, "Summarise the chemical requirements.");
  }
  if (standard.key_sections?.["Physical Requirements"] || standard.key_sections?.["Physical Requirement"]) {
    base.splice(1, 0, "What are the physical requirements?");
  }
  return base.slice(0, 3);
}
