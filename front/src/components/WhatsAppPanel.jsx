import React, { useEffect, useState } from "react";
import api from "../setupAxios";
import "../styles/WhatsAppPanel.css";

export default function WhatsAppPanel() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  /* ───────── Load conversations ───────── */
  const loadConversations = async () => {
    const { data } = await api.get("/api/whatsapp/conversations");
    setConversations(data);
  };

  /* ───────── Load messages ───────── */
  const openConversation = async (conv) => {
    setActive(conv);
    const { data } = await api.get(`/api/whatsapp/messages/${conv.id}`);
    setMessages(data);
  };

  /* ───────── Send message ───────── */
  const sendMessage = async () => {
    if (!text.trim() || !active) return;
    setLoading(true);

    try {
      await api.post("/api/whatsapp/send", {
        to: active.phone,
        text
      });

      setMessages((prev) => [
        ...prev,
        {
          direction: "OUT",
          text,
          timestamp: new Date().toISOString()
        }
      ]);

      setText("");
      loadConversations();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="wa-panel">
      {/* LEFT */}
      <aside className="wa-list">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`wa-item ${active?.id === c.id ? "active" : ""}`}
            onClick={() => openConversation(c)}
          >
            <div className="wa-phone">{c.phone}</div>
            <div className="wa-last">{c.lastMessage}</div>
            {c.unread > 0 && <span className="wa-badge">{c.unread}</span>}
          </div>
        ))}
      </aside>

      {/* RIGHT */}
      <section className="wa-chat">
        {!active && <div className="wa-empty">Select a conversation</div>}

        {active && (
          <>
            <header className="wa-header">
              <strong>{active.phone}</strong>
            </header>

            <div className="wa-messages">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`wa-msg ${m.direction === "OUT" ? "out" : "in"}`}
                >
                  {m.text}
                </div>
              ))}
            </div>

            <footer className="wa-input">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a message…"
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              />
              <button onClick={sendMessage} disabled={loading}>
                Send
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
