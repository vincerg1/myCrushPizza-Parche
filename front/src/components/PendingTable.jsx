// ─────────────────────────────────────────────────────────
// src/components/PendingTable.jsx
// Lista de pedidos pendientes  +  botón Ready  +  Ticket modal
// ─────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import moment from "moment";
import 'moment/dist/locale/es';
import Ticket from "./Ticket";
import "../styles/PendingTable.css";

const REFRESH_MS = 60_000; // 1 minuto

export default function PendingTable() {
  /* ─── estados ────────────────────────────────────────── */
  const [rows, setRows] = useState([]);
  const [menu, setMenu] = useState([]);
  const [stores, setStores] = useState([]);
  const [view, setView] = useState(null);

  /* sello y countdown */
  const [lastUpdate, setLastUpdate] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [loading, setLoading] = useState(false);

  /* ─── carga: pedidos ─────────────────────────────────── */
  const loadPending = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/sales/pending");
      setRows(data);
      setLastUpdate(new Date());
      setSecondsLeft(Math.floor(REFRESH_MS / 1000));
    } catch (e) {
      console.error("load pending", e);
    } finally {
      setLoading(false);
    }
  };

  /* ─── carga fija: menú y tiendas ─────────────────────── */
  const loadMenu = async () => {
    try {
      const { data } = await axios.get("/api/pizzas");
      setMenu(data);
    } catch (e) { console.error("load pizzas", e); }
  };
  const loadStores = async () => {
    try {
      const { data } = await axios.get("/api/stores");
      setStores(data);
    } catch (e) { console.error("load stores", e); }
  };

  /* ─── efecto inicial + cronómetro ────────────────────── */
  useEffect(() => {
    loadPending();
    loadMenu();
    loadStores();

    // reloj que baja cada segundo
    const secId = setInterval(() => {
      setSecondsLeft((s) => (s != null && s > 0 ? s - 1 : s));
    }, 1000);

    // refresco cada minuto
    const refId = setInterval(loadPending, REFRESH_MS);

    return () => {
      clearInterval(secId);
      clearInterval(refId);
    };
  }, []);

  useEffect(() => {
  const btn = document.getElementById("pending-tab");
  if (!btn) return;               // aún no montado

  if (rows.length > 0) {
    btn.classList.add("blink");
  } else {
    btn.classList.remove("blink");
  }
}, [rows]);

  /* ─── helpers: maps ───────────────────────────────────── */
const nameById = useMemo(() => {
  const map = Object.create(null);

  (Array.isArray(menu) ? menu : []).forEach((p) => {
    if (!p) return;                 // null/undefined safety
    map[p.id] = p.nombre ?? p.name ?? "";
  });

  return map;
}, [menu]);

/** Mapea id-de-store → nombre-de-store */
const storeById = useMemo(() => {
  const map = Object.create(null);

  (Array.isArray(stores) ? stores : []).forEach((s) => {
    if (!s) return;
    map[s.id] = s.storeName ?? s.name ?? "";
  });

  return map;
}, [stores]);

  const fmtProducts = (sale) => {
    try {
      const list = Array.isArray(sale.products) ? sale.products : JSON.parse(sale.products ?? "[]");
      return list.map((p) => `${nameById[p.pizzaId] || `#${p.pizzaId}`} ${p.size}×${p.qty ?? p.cantidad ?? 1}`).join(", ");
    } catch { return "--"; }
  };

  const markReady = async (id) => {
    try {
      await axios.patch(`/api/sales/${id}/ready`);
      setRows((r) => r.filter((s) => s.id !== id));
    } catch (e) { console.error(e); alert("Error marcando Ready"); }
  };

  const printTicket = () => {
    const html = document.getElementById("ticket-content")?.innerHTML;
    if (!html) return;
    const w = window.open("", "", "width=320,height=600");
    w.document.write(`<html><body>${html}</body></html>`);
    w.document.close(); w.focus(); w.print(); w.close();
  };

  /* ─── badge text ─────────────────────────────────────── */
  const badgeText = loading
    ? "Updating…"
    : secondsLeft != null
      ? `Next: ${secondsLeft}s`
      : "";

  /* ─── UI ─────────────────────────────────────────────── */
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Pending orders</h3>
        {badgeText && <span className="badge">{badgeText}</span>}
      </div>

      {rows.length === 0 ? (
        <div className="no-orders">
          <span className="emoji">🐒</span>
          <span className="msg">Chill For Now ;)</span>
        </div>
      ) : (
        <table className="orders">
          <thead>
            <tr>
              <th>Code</th><th>Fecha</th><th>Tipo</th><th>Store</th>
              <th>Items</th><th>Cliente</th><th>Tlf</th>
              <th>Ready</th><th>Ticket</th>
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
                <td><button onClick={() => markReady(s.id)}>Ready</button></td>
                <td><button onClick={() => setView(s)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view && (
        <div className="pt-modal-back" onClick={() => setView(null)}>
          <div className="pt-modal-card" style={{ width: "62mm" }} onClick={(e) => e.stopPropagation()}>
            <div id="ticket-content"><Ticket order={view} /></div>
            <div className="pt-buttons">
              <button onClick={printTicket}>Print</button>
              <button onClick={() => setView(null)}>✕</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .orders{ width:100%; border-collapse:collapse; font-size:.85rem }
        .orders th,.orders td{ border:1px solid #ccc; padding:.35rem }
        .orders th{ background:#fafafa }
        .orders button{ padding:.25rem .55rem; cursor:pointer }

        .badge{
          background:#e53935; color:#fff; border-radius:4px; padding:2px 8px;
          font-size:.75rem; font-family:monospace; font-weight:600;
        }

        .no-orders{ margin:4rem auto 1.2rem; text-align:center; display:flex; flex-direction:column; align-items:center; gap:.25rem; color:#555; font-family:sans-serif; }
        .no-orders .emoji{ font-size:3.5rem; line-height:1; }
        .no-orders .msg{ font-weight:600; letter-spacing:.5px; font-style:italic; }

        .pt-modal-back{ position:fixed; inset:0; background:#0007; display:flex; align-items:center; justify-content:center; z-index:999; }
        .pt-modal-card{ background:#fff; padding:12px 8px; border-radius:6px; box-shadow:0 6px 18px #0004; max-height:90vh; overflow:auto; position:relative; text-align:center; }
        .pt-buttons{ display:flex; gap:6px; justify-content:center; margin-top:6px }
        .pt-buttons button{ padding:.3rem .9rem; cursor:pointer }
      `}</style>
    </>
  );
}
