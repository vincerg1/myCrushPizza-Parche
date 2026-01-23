import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import moment from "moment";
import "moment/dist/locale/es";
import Ticket from "./Ticket";
import "../styles/PendingTable.css";
import api from "../setupAxios";
import { useAuth } from "./AuthContext";
import { buildTicketText } from "../utils/ticketText";
const FALLBACK_POLL_MS = 10_000; // fallback polling every 10 seconds

export default function PendingTable() {
  const ENABLE_SSE = false;
  const [rows, setRows] = useState([]);
  const [menu, setMenu] = useState([]);
  const [stores, setStores] = useState([]);
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const audioRef = useRef(null);
  const prevIdsRef = useRef(new Set());
  const [alertOrders, setAlertOrders] = useState([]);
  const [isRinging, setIsRinging] = useState(false);
  const [needSoundUnlock, setNeedSoundUnlock] = useState(false);
  const { auth } = useAuth();
  const [confirmOrderId, setConfirmOrderId] = useState(null);
  const lastFetchAtRef = useRef(null);

  /* ---------- sound control ---------- */
  const ringStart = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      audioRef.current.loop = true;
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
      setIsRinging(true);
      setNeedSoundUnlock(false);
    } catch {
      setNeedSoundUnlock(true);
      setIsRinging(false);
    }
  }, []);

  const ringStop = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } finally {
      setIsRinging(false);
    }
  }, []);

  const unlockSound = useCallback(async () => {
    if (!audioRef.current) return;
    try {
      await audioRef.current.play();
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setNeedSoundUnlock(false);
      if (alertOrders.length > 0) ringStart();
    } catch { /* no-op */ }
  }, [alertOrders.length, ringStart]);

  useEffect(() => {
    if (!needSoundUnlock) return;
    const onAny = () => unlockSound();
    window.addEventListener("pointerdown", onAny, { once: true });
    window.addEventListener("keydown", onAny, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onAny);
      window.removeEventListener("keydown", onAny);
    };
  }, [needSoundUnlock, unlockSound]);

  /* ---------- load pending orders ---------- */
  const loadPending = useCallback(
    async (since = null) => {
      setLoading(true);
      try {
        const params = {};
        if (since) params.since = since;
        const { data } = await api.get("/api/sales/pending", { params });
        const arr = Array.isArray(data) ? data : [];

        lastFetchAtRef.current = new Date().toISOString();

        const idsNow = new Set(arr.map((s) => s.id));
        const newOnes = arr.filter((s) => !prevIdsRef.current.has(s.id));

        setRows((prev) => {
          if (since && prev.length > 0) {
            const merged = [...prev];
            newOnes.forEach((s) => merged.push(s));
            return merged;
          }
          return arr;
        });

        prevIdsRef.current = new Set([...prevIdsRef.current, ...idsNow]);

        if (newOnes.length > 0) {
          setAlertOrders((prev) => [...prev, ...newOnes]);
          await ringStart();
        }
      } catch (e) {
        if (e?.response?.status === 401) {
          console.warn("Unauthorized en /api/sales/pending. Rehaz login.");
          return;
        }
        console.error("load pending", e);
      } finally {
        setLoading(false);
      }
    },
    [ringStart]
  );

  /* ---------- load auxiliary data (menu, stores) ---------- */
  const loadMenu = useCallback(async () => {
    try {
      const { data } = await api.get("/api/pizzas");
      setMenu(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("load pizzas", e);
    }
  }, []);

  const loadStores = useCallback(async () => {
    try {
      const { data } = await api.get("/api/stores");
      setStores(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("load stores", e);
    }
  }, []);

  /* ---------- SSE connection handling and fallback polling ---------- */
  useEffect(() => {
    let cancelled = false;
    let pollingTimer = null;

    const startFallbackPolling = () => {
      async function pollLoop() {
        if (cancelled) return;
        const since = lastFetchAtRef.current;
        await loadPending(since);
        if (cancelled) return;
        pollingTimer = setTimeout(pollLoop, FALLBACK_POLL_MS);
      }
      pollLoop();
    };

    const init = async () => {
      await Promise.all([loadPending(), loadMenu(), loadStores()]);
      startFallbackPolling();
    };

    init();

    return () => {
      cancelled = true;
      if (pollingTimer) clearTimeout(pollingTimer);
    };
  }, [loadPending, loadMenu, loadStores]);

  /* ---------- UI effects ---------- */
  useEffect(() => {
    const btn = document.getElementById("pending-tab");
    if (!btn) return;
    rows.length > 0 ? btn.classList.add("blink") : btn.classList.remove("blink");
  }, [rows]);

  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.dispatchEvent(new Event("scroll"));
  }, [rows]);

  useEffect(() => {
    if (alertOrders.length === 0) ringStop();
  }, [alertOrders.length, ringStop]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && alertOrders.length > 0) setAlertOrders([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alertOrders.length]);

  /* ---------- helpers render ---------- */
  const nameById = useMemo(() => {
    const m = {};
    (menu || []).forEach((p) => {
      m[p?.id] = p?.nombre ?? p?.name ?? "";
    });
    return m;
  }, [menu]);

  const storeById = useMemo(() => {
    const m = {};
    (stores || []).forEach((s) => {
      m[s?.id] = s?.storeName ?? s?.name ?? "";
    });
    return m;
  }, [stores]);
  // ---- JSX helper: Items por línea (solo cards POS) ----
const renderItemsLines = (sale) => {
  const list = arrFrom(sale?.products);

  if (!list.length) return <span>-</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {list.map((p, i) => {
        const baseName =
          (p?.name && String(p.name).trim()) ||
          (p?.pizzaName && String(p.pizzaName).trim()) ||
          (p?.pizzaId ? (nameById[p.pizzaId] || `#${p.pizzaId}`) : "Producto");

        const size = p?.size || "";
        const qty  = Number(p?.qty ?? p?.cantidad ?? 1);

        const extras = Array.from(
          new Set(arrFrom(p?.extras).map(extraText))
        );

        return (
          <span key={i}>
            {baseName} {size}×{qty}
            {extras.length > 0 && (
              <small style={{ display: "block", color: "#666" }}>
                + {extras.join(", ")}
              </small>
            )}
          </span>
        );
      })}
    </div>
  );
};


  // ---- TOTAL helper (defensivo POS) ----
const getTotal = (sale) => {
  const raw =
    sale?.total ??
    sale?.totalAmount ??
    sale?.amount ??
    sale?.price ??
    0;

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};
  
  const fmtTotal = (sale) =>
  getTotal(sale).toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
  });
  const parseOnce = (v) => {
    if (typeof v !== "string") return v;
    try { return JSON.parse(v); } catch { return v; }
  };
  const arrFrom = (v) => {
    const a = parseOnce(v);
    const b = parseOnce(a);         // tolera doble stringificación
    return Array.isArray(b) ? b : [];
  };
  const extraText = (e) => (e?.label ?? e?.name ?? e?.code ?? "extra").toString();

  const fmtProducts = (sale) => {
    const list = arrFrom(sale?.products);
    return list.map((p) => {
      const baseName =
        (p?.name && String(p.name).trim()) ||
        (p?.pizzaName && String(p.pizzaName).trim()) ||
        (p?.pizzaId ? (nameById[p.pizzaId] || `#${p.pizzaId}`) : "Producto");

      const size = p?.size || "";
      const qty  = Number(p?.qty ?? p?.cantidad ?? 1);

      const extras = Array.from(new Set(arrFrom(p?.extras).map(extraText))); // desdup opcional
      const base = `${baseName} ${size}×${qty}`;
      return extras.length ? `${base} [+ ${extras.join(", ")}]` : base;
    }).join(", ");
  };
  const markReady = async (id) => {
    try {
      await api.patch(`/api/sales/${id}/ready`);
      setRows((r) => r.filter((s) => s.id !== id));
      setAlertOrders((alts) => alts.filter((s) => s.id !== id));
    } catch (e) {
      console.error(e);
      alert("Error marcando Ready");
    }
  };

  const requestConfirmReady = (id) => setConfirmOrderId(id);
  const handleConfirmReady = async () => {
    if (confirmOrderId != null) await markReady(confirmOrderId);
    setConfirmOrderId(null);
  };
  const handleCancelReady = () => setConfirmOrderId(null);

const printTicket = async () => {
  if (!view) return;

  const text = buildTicketText(view);

  try {
    await api.post("/api/print-ticket", {
      ticket: text,
      orderId: view.id,
    });

    console.log("Ticket enviado al backend");
  } catch (err) {
    console.error("Error enviando ticket", err);
    alert("No se pudo imprimir el ticket");
  }
};



  const badgeNext = loading
    ? "Updating…"
    : secondsLeft != null
    ? `Next: ${secondsLeft}s`
    : "";
  const badgeCount = rows.length ? rows.length : null;

  return (
    <>
      <audio ref={audioRef} src="/telephone-ring-03b.mp3" preload="auto" />

      <div className="pt-headerPT">
<div className="pt-store-name">
  as {auth?.storeName?.trim() ? auth.storeName : "Admin"}
</div>

        <div className="pt-title-row">
          <h3>Pending orders</h3>
          {badgeCount && <span className="badge badge-count">{badgeCount}</span>}
          {badgeNext && <span className="badge">{badgeNext}</span>}
          {isRinging && (
            <button className="mute-inline" onClick={() => setAlertOrders([])}>
              Silenciar
            </button>
          )}
        </div>
      </div>

      {needSoundUnlock && alertOrders.length > 0 && (
        <div className="sound-toast" onClick={unlockSound}>
          🔇 Pulsa para habilitar sonido
        </div>
      )}
      {rows.length === 0 && (
        <div className="no-orders">
          <span className="emoji">🐒</span>
          <span className="msg">Chill For Now ;)</span>
        </div>
      )}
      {rows.length > 0 && (
        <table className="orders">
          <thead>
            <tr>
              <th>Code</th>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Store</th>
              <th>Items</th>
              <th>Cliente</th>
              <th>Tlf</th>
              <th>Ready</th>
              <th>Ticket</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.code}</td>
                <td>{moment(s.date).format("DD/MM/YY HH:mm")}</td>
                <td>{s.type}</td>
                <td>{storeById[s.storeId] || s.storeName || "-"}</td>
                <td>{fmtProducts(s)}</td>
                <td>{s.customerData?.name ?? "-"}</td>
                <td>{s.customerData?.phone ?? "-"}</td>
                <td>
                  <button onClick={() => requestConfirmReady(s.id)}>Ready</button>
                </td>
                <td>
                  <button onClick={() => setView(s)}>Ver</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
     {rows.length > 0 && (
  <>
    <div className="pt-dots">
      {rows.map((_, i) => (
        <span key={i} className="pt-dot" />
      ))}
    </div>

    <div
      ref={scrollRef}
      className="orders-scroll"
      onScroll={() => {
        const el = scrollRef.current;
        const idx = Math.round(el.scrollLeft / el.clientWidth);
        el.parentElement
          .querySelectorAll(".pt-dot")
          .forEach((d, i) => d.classList.toggle("active", i === idx));
      }}
    >
      {rows.map((s) => (
        <article className="order-card" key={`card-${s.id}`}>
          <div className="row">
            <strong>Code</strong>
            <span>{s.code}</span>
          </div>

          <div className="row">
            <strong>Date</strong>
            <span>{moment(s.date).format("DD/MM HH:mm")}</span>
          </div>

          <div className="row">
            <strong>Type</strong>
            <span>{s.type}</span>
          </div>

          <div className="row">
            <strong>Store</strong>
            <span>{storeById[s.storeId] || s.storeName || "-"}</span>
          </div>

          <div className="row">
            <strong>Items</strong>
            <span>{renderItemsLines(s)}</span>
          </div>

          <div className="row">
            <strong>Total</strong>
            <span style={{ fontWeight: 700, color: "#f92672" }}>
              {fmtTotal(s)}
            </span>
          </div>

          {/* ✅ Dirección como row secundaria */}
          {s.type === "DELIVERY" && s.customerData?.address_1 && (
            <div className="row">
              <strong>Adress</strong>
              <span
            style={{
              fontSize: "0.78rem",
              color: "#fff",
              lineHeight: 1.25,
              background: "#f92672",
              padding: "4px 8px",
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}

                title={s.customerData.address_1}
              >
              {s.customerData.address_1}
              </span>
            </div>
          )}

          <div className="row">
            <strong>Client</strong>
            <span>{s.customerData?.name ?? "-"}</span>
          </div>

          <div className="row">
            <strong>Tlf</strong>
            <span>{s.customerData?.phone ?? "-"}</span>
          </div>

          <button onClick={() => requestConfirmReady(s.id)}>Ready</button>
          <button onClick={() => setView(s)}>Ver</button>
        </article>
      ))}
    </div>
  </>
      )}
      {view && (
        <div className="pt-modal-back" onClick={() => setView(null)}>
          <div
            className="pt-modal-card"
            style={{ width: "62mm" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div id="ticket-content">
              <Ticket order={view} />
            </div>
            <div className="pt-buttons">
              <button onClick={printTicket}>Print</button>
              <button onClick={() => setView(null)}>✕</button>
            </div>
          </div>
        </div>
      )}
      {confirmOrderId != null && (
        <div className="pt-modal-back" onClick={handleCancelReady}>
          <div className="pt-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Confirmar listo</h3>
            <p>
              ¿Estás seguro de que quieres marcar este pedido como listo? Esto notificará al cliente.
            </p>
            <div className="pt-buttons">
              <button onClick={handleConfirmReady}>Sí, marcar listo</button>
              <button onClick={handleCancelReady}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {alertOrders.length > 0 && (
        <div className="pt-modal-back">
          <div
            className="pt-modal-card"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>
              🔔 Nuevos pedidos ({alertOrders.length})
            </h3>
            <ul className="alert-list">
              {alertOrders.slice(0, 5).map((o) => (
                <li key={o.id}>
                  <b>{o.code}</b> — {moment(o.date).format("HH:mm")} · {o.type} ·{" "}
                  {storeById[o.storeId] || o.storeName || "-"}
                  <br />
                  <small>{fmtProducts(o)}</small>
                </li>
              ))}
            </ul>
            {alertOrders.length > 5 && (
              <div className="more">…y {alertOrders.length - 5} más</div>
            )}
            <div className="pt-buttons">
              <button onClick={() => setAlertOrders([])}>
                Aceptar y silenciar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .sound-toast{
          position:fixed; right:12px; top:12px; z-index:1000;
          background:#fff3cd; border:1px solid #ffeeba; color:#7a5d00;
          padding:.4rem .6rem; border-radius:8px; cursor:pointer;
          box-shadow:0 2px 10px #0002; user-select:none;
        }
       
        .badge{background:#f92672;color:#fff;border-radius:4px;padding:2px 8px;font-size:.75rem;font-family:monospace;font-weight:600}
        .badge-count{background:#f92672}
        @media (max-width:768px){
          table.orders{display:none}
          .orders-scroll{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
          .order-card{scroll-snap-align:center;min-width:85%;background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 2px 6px #0001;padding:10px;display:flex;flex-direction:column;gap:4px;font-size:.9rem}
          .order-card .row{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:2px 0}
          .order-card .row:last-of-type{border-bottom:none}
          .order-card button{width:100%;margin-top:6px;padding:8px 0}
        }
        .orders{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:12px}
        .orders th,.orders td{border:1px solid #ccc;padding:.35rem;text-align:center}
        .orders th{background:#fafafa}
        .orders button{padding:.25rem .55rem;cursor:pointer}
        .no-orders{margin:10rem auto 1.2rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.25rem;color:#555;font-family:sans-serif}
        .no-orders .emoji{font-size:5rem;line-height:1}
        .pt-modal-back{position:fixed;inset:0;background:#0007;display:flex;align-items:center;justify-content:center;z-index:999}
        .pt-modal-card{background:#fff;padding:12px 14px;border-radius:8px;box-shadow:0 6px 18px #0004;max-height:90vh;overflow:auto;position:relative;text-align:left}
        .pt-buttons{display:flex;gap:6px;justify-content:center;margin-top:8px}
        .pt-buttons button{padding:.35rem .9rem;cursor:pointer}
        .alert-list{margin:.2rem 0; padding-left:1rem}
        .alert-list li{margin:.25rem 0}
        .more{opacity:.7; font-size:.9rem}
        .mute-inline{margin-left:auto; padding:.25rem .55rem; cursor:pointer}
      `}</style>
    </>
  );
}
