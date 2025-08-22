// src/components/PendingTable.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import moment from "moment";
import "moment/dist/locale/es";
import Ticket from "./Ticket";
import "../styles/PendingTable.css";
import api from "../setupAxios";

const REFRESH_MS = 60_000; // 1 min

export default function PendingTable() {
  const [rows, setRows] = useState([]);
  const [menu, setMenu] = useState([]);
  const [stores, setStores] = useState([]);
  const [view, setView] = useState(null);

  const [secondsLeft, setSecondsLeft] = useState(null);
  const [loading, setLoading] = useState(false);

  const audioRef = useRef(null);
  const prevIdsRef = useRef(new Set());
  const [alertOrders, setAlertOrders] = useState([]);
  const [isRinging, setIsRinging] = useState(false);
  const [needSoundUnlock, setNeedSoundUnlock] = useState(false);

  /* ---------- sonido ---------- */
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
    } catch {}
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

  /* ---------- cargar pendientes ---------- */
  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/sales/pending");
      const arr = Array.isArray(data) ? data : [];

      const idsNow = new Set(arr.map((s) => s.id));
      const newOnes = arr.filter((s) => !prevIdsRef.current.has(s.id));

      setRows(arr);
      prevIdsRef.current = idsNow;

      if (newOnes.length > 0) {
        setAlertOrders(newOnes);
        await ringStart();
      }
    } catch (e) {
      console.error("load pending", e);
    } finally {
      setLoading(false);
    }
  }, [ringStart]);

  /* ---------- datos auxiliares ---------- */
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

  /* ---------- inicial + bucle robusto ---------- */
  useEffect(() => {
    let cancelled = false;
    let tickId = null;
    let secId = null;

    const loop = async () => {
      // si la pestaña está oculta, igualmente hacemos pull (podrías pausar si quieres)
      await loadPending();
      if (cancelled) return;

      setSecondsLeft(Math.floor(REFRESH_MS / 1000));
      tickId = setTimeout(loop, REFRESH_MS);
    };

    // arranque inicial + datos auxiliares
    (async () => {
      await Promise.all([loadPending(), loadMenu(), loadStores()]);
      setSecondsLeft(Math.floor(REFRESH_MS / 1000));
      tickId = setTimeout(loop, REFRESH_MS);
    })();

    // contador visual
    secId = setInterval(() => {
      setSecondsLeft((s) => (s != null && s > 0 ? s - 1 : s));
    }, 1000);

    return () => {
      cancelled = true;
      if (tickId) clearTimeout(tickId);
      if (secId) clearInterval(secId);
    };
  }, [loadPending, loadMenu, loadStores]);

  /* ---------- varios efectos UI ---------- */
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

  const fmtProducts = (sale) => {
    let list = [];
    try {
      const raw = sale.products ?? "[]";
      list = Array.isArray(raw) ? raw : JSON.parse(raw);
    } catch {}
    if (!Array.isArray(list)) list = [];
    return list
      .map(
        (p) =>
          `${nameById[p.pizzaId] || `#${p.pizzaId}`} ${p.size}×${
            p.qty ?? p.cantidad ?? 1
          }`
      )
      .join(", ");
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

  const printTicket = () => {
    const html = document.getElementById("ticket-content")?.innerHTML;
    if (!html) return;
    const w = window.open("", "", "width=320,height=600");
    w.document.write(`<html><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
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

      <div className="pt-header">
        <h3>Pending orders</h3>
        {badgeCount && <span className="badge badge-count">{badgeCount}</span>}
        {badgeNext && <span className="badge">{badgeNext}</span>}
        {isRinging && (
          <button className="mute-inline" onClick={() => setAlertOrders([])}>
            Silenciar
          </button>
        )}
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
                  <button onClick={() => markReady(s.id)}>Ready</button>
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
                  <span>{fmtProducts(s)}</span>
                </div>
                <div className="row">
                  <strong>Client</strong>
                  <span>{s.customerData?.name ?? "-"}</span>
                </div>
                <div className="row">
                  <strong>Tlf</strong>
                  <span>{s.customerData?.phone ?? "-"}</span>
                </div>
                <button onClick={() => markReady(s.id)}>Ready</button>
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
        .pt-header{display:flex;align-items:center;gap:6px}
        .badge{background:#e53935;color:#fff;border-radius:4px;padding:2px 8px;font-size:.75rem;font-family:monospace;font-weight:600}
        .badge-count{background:#4285f4}
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
        .no-orders{margin:4rem auto 1.2rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:.25rem;color:#555;font-family:sans-serif}
        .no-orders .emoji{font-size:3.5rem;line-height:1}
        .no-orders .msg{font-weight:600;letter-spacing:.5px;font-style:italic}
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
