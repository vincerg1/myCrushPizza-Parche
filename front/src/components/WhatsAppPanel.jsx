import React, { useEffect, useState } from "react";
import api from "../setupAxios";
import "../styles/WhatsAppPanel.css";

export default function WhatsAppPanel() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const loadConversations = async () => {
    const { data } = await api.get("/api/whatsapp/conversations");
    setConversations(data);
  };

  const openConversation = async (conv) => {
    setActive(conv);
    const { data } = await api.get(`/api/whatsapp/messages/${conv.id}`);
    setMessages(data);
  };

  const refreshActiveMessages = async () => {
    if (!active?.id) return;
    const { data } = await api.get(`/api/whatsapp/messages/${active.id}`);
    setMessages(data);
  };

  const sendMessage = async () => {
    if (!text.trim() || !active) return;
    setLoading(true);

    try {
      await api.post("/api/whatsapp/send", {
        to: active.phoneE164, // <-- FIX
        text,
      });

      setText("");
      await refreshActiveMessages();
      await loadConversations();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
    const t = setInterval(async () => {
      await loadConversations();
      await refreshActiveMessages();
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  return (
    <div className="wa-panel">
      <aside className="wa-list">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`wa-item ${active?.id === c.id ? "active" : ""}`}
            onClick={() => openConversation(c)}
          >
            <div className="wa-phone">{c.username || c.phoneE164}</div>
            <div className="wa-last">{c.lastMessage}</div>
            {c.unread > 0 && <span className="wa-badge">{c.unread}</span>}
          </div>
        ))}
      </aside>

      <section className="wa-chat">
        {!active && <div className="wa-empty">Select a conversation</div>}

        {active && (
          <>
            <header className="wa-header">
              <strong>{active.username || active.phoneE164}</strong>
            </header>

            <div className="wa-messages">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`wa-msg ${m.direction === "OUT" ? "out" : "in"}`}
                >
                  {m.text || (m.type === "template" ? "[TEMPLATE]" : "")}
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
