// ─────────────────────────────────────────────────────────
// Ticket.jsx  (PRINT-READY)
//  • Optimizado para impresoras térmicas 58mm en Windows
//  • Usa window.print()
// ─────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import moment from "moment";
import "moment/dist/locale/es";
import api from "../setupAxios";

export default function Ticket({ order, autoPrint = false }) {
  /* ───── catálogo y tienda ───── */
  const [menu, setMenu] = useState([]);
  const [store, setStore] = useState(null);

  useEffect(() => {
    api.get("/api/pizzas")
      .then(r => setMenu(Array.isArray(r.data) ? r.data : []))
      .catch(() => setMenu([]));
  }, []);

  useEffect(() => {
    if (order.storeId) {
      api.get(`/api/stores/${order.storeId}`)
        .then(r => setStore(r.data))
        .catch(() => {});
    }
  }, [order.storeId]);

  /* ───── helpers ───── */
  const nameById = useMemo(() => {
    const map = {};
    menu.forEach(p => { map[p.id] = p.name ?? p.nombre; });
    return map;
  }, [menu]);

  const products = useMemo(() => {
    try {
      return Array.isArray(order.products)
        ? order.products
        : JSON.parse(order.products || "[]");
    } catch {
      return [];
    }
  }, [order.products]);

  const parseExtras = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const uniqLabels = (arr) => {
    const seen = new Set();
    return arr.filter(e => {
      const t = e?.label ?? e?.name ?? e?.code ?? "extra";
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    }).map(e => e.label ?? e.name ?? e.code);
  };

  /* ───── fecha ───── */
  const f = moment(order.date).locale("es");
  const fecha = f.format("DD/MM/YY");
  const hora  = f.format("HH:mm");

  /* ───── IDs ───── */
  const customerCode =
    order.customerCode ??
    order.customer?.code ??
    (order.customerId ? `CUS-${order.customerId}` : "N/A");

  const orderCode = order.code ?? `ORD-${order.id}`;
  const qrURL = `${window.location.origin}/customer/${orderCode}`;

  /* ───── impresión automática (opcional) ───── */
  useEffect(() => {
    if (autoPrint) {
      setTimeout(() => window.print(), 300);
    }
  }, [autoPrint]);

  const storeName = store?.storeName
    ? `Pizzería ${store.storeName}`
    : "Pizzería";

  return (
    <>
      <div className="tkt">
        {/* ── Header ── */}
        <div className="tkt-head">
          <strong>{storeName}</strong><br />
          {fecha} {hora}<br />
          {customerCode}<br />
          {orderCode}
        </div>

        {/* ── Items ── */}
        <table className="tkt-items">
          <tbody>
            {products.map((p, i) => {
              const extras = uniqLabels(parseExtras(p.extras));
              return (
                <React.Fragment key={i}>
                  <tr>
                    <td>{p.name || nameById[p.pizzaId] || `#${p.pizzaId}`}</td>
                    <td className="amt">{p.size} ×{p.qty ?? 1}</td>
                  </tr>

                  {extras.length > 0 && (
                    <tr>
                      <td colSpan={2} className="extras">
                        + {extras.join(", ")}
                      </td>
                    </tr>
                  )}

                  {p.notes && (
                    <tr>
                      <td colSpan={2} className="p-notes">
                        Obs.: {p.notes}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {/* ── Total ── */}
        <div className="tkt-total">
          Total: {Number(order.total ?? 0).toFixed(2)} €
        </div>

        <div className="tkt-sep" />

        {/* ── Tipo ── */}
        <div className="tkt-type">{order.type}</div>

        {/* ── QR ── */}
        <div className="tkt-qr">
          <QRCode value={qrURL} size={120} />
        </div>

        {order.notes && (
          <div className="tkt-notes">
            <strong>Obs.:</strong> {order.notes}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="tkt-foot">
          Gracias por su pedido
          <div className="tkt-sep" />
          {store && (
            <div className="tkt-contact">
              Tel: {store.tlf || "-"}<br />
              {store.address}
            </div>
          )}
        </div>
      </div>

      {/* ───────────────── PRINT CSS ───────────────── */}
      <style>{`
        body {
          margin: 0;
        }

        .tkt {
          font-family: monospace;
          width: 58mm;
          max-width: 58mm;
          font-size: 11px;
          text-align: center;
        }

        .tkt-items {
          width: 100%;
          border-top: 1px dashed #000;
          margin: 4px 0;
        }

        .tkt-items td {
          padding: 2px 0;
        }

        .amt {
          text-align: right;
        }

        .extras, .p-notes {
          font-size: 10px;
          text-align: left;
        }

        .tkt-total {
          border-top: 1px dashed #000;
          margin-top: 4px;
          padding-top: 2px;
          text-align: right;
        }

        .tkt-sep {
          border-top: 1px dashed #000;
          margin: 4px 0;
        }

        .tkt-foot {
          font-size: 9px;
          margin-top: 6px;
        }

        @media print {
          body * {
            visibility: hidden;
          }

          .tkt, .tkt * {
            visibility: visible;
          }

          .tkt {
            position: absolute;
            left: 0;
            top: 0;
          }
        }
      `}</style>
    </>
  );
}
