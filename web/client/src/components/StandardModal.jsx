import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { askQuestion } from "../api/standards";
import "./StandardModal.css";

export default function StandardModal({ standard, onClose }) {
  const { t } = useTranslation();
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);
  const inputRef = useRef(null);

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
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
      setAiError(err.message || t("common.serverError"));
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
        aria-describedby="modal-summary"
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
            aria-label={t("modal.closeLabel")}
          />
        </div>

        {/* Standard detail */}
        <div className="modal-body">
          {standard.summary && (
            <div className="modal-section" id="modal-summary">
              <p className="modal-section-title">{t("modal.summary")}</p>
              <p className="modal-section-body">{standard.summary}</p>
            </div>
          )}

          {standard.keywords?.length > 0 && (
            <div className="modal-section">
              <p className="modal-section-title">{t("modal.keywords")}</p>
              <div className="modal-keywords">
                {standard.keywords.map((kw) => (
                  <span className="modal-keyword" key={kw}>{kw}</span>
                ))}
              </div>
            </div>
          )}

          {sections.length > 0 && (
            <div className="modal-section">
              <p className="modal-section-title">{t("modal.keySections")}</p>
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
          <div className="modal-section ai-panel" aria-label={t("modal.askAI")}>
            <p className="modal-section-title">
              {t("modal.askAI")}
            </p>

            {messages.length > 0 && (
              <div className="chat-log" aria-live="polite" aria-label={t("modal.conversation")}>
                {messages.map((m, i) => (
                  <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
                    <p className="bubble-text">{m.text}</p>
                  </div>
                ))}
                {asking && (
                  <div className="chat-bubble chat-bubble--ai chat-bubble--loading" aria-label={t("modal.aiThinking")}>
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
              <div className="chat-suggestions" aria-label={t("modal.suggestionsLabel")}>
                {getSuggestions(standard, t).map((s) => (
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

            <form className="chat-form" onSubmit={handleAsk} aria-label={t("modal.askAI")}>
              <input
                ref={inputRef}
                className="chat-input"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t("modal.chatPlaceholder")}
                maxLength={500}
                disabled={asking}
                aria-label={t("modal.questionLabel")}
              />
              <button
                className="chat-send"
                type="submit"
                disabled={!question.trim() || asking}
                aria-label={t("modal.sendLabel")}
              >
                {asking ? t("modal.sending") : t("modal.askBtn")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function getSuggestions(standard, t) {
  const base = [
    t("modal.suggestion_keyReq", { id: standard.standard_id }),
    t("modal.suggestion_materials"),
    t("modal.suggestion_delivery"),
  ];
  if (standard.key_sections?.["Chemical Requirements"]) {
    base.splice(1, 0, t("modal.suggestion_chemical"));
  }
  if (standard.key_sections?.["Physical Requirements"] || standard.key_sections?.["Physical Requirement"]) {
    base.splice(1, 0, t("modal.suggestion_physical"));
  }
  return base.slice(0, 3);
}
