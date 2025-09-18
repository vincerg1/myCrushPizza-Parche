// ─────────────────────────────────────────────────────────
// Ticket.jsx
//  • QR principal → /customer/ORD-xxxxx  (página resumen)
//  • Encabezado incluye Customer ID y Order ID
// ─────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import QRCode    from "react-qr-code";
import moment    from "moment";
import "moment/dist/locale/es";
import api       from "../setupAxios";

export default function Ticket({ order }) {
  /* ───── catálogo y tienda ───── */
  const [menu , setMenu ] = useState([]);
  const [store, setStore] = useState(null);

  /* catálogo completo de pizzas */
  useEffect(() => {
    api.get("/api/pizzas")
       .then(r => setMenu(Array.isArray(r.data) ? r.data : []))
       .catch(err => { console.error(err); setMenu([]); });
  }, []);

  /* datos tienda */
  useEffect(() => {
    if (order.storeId)
      api.get(`/api/stores/${order.storeId}`)
         .then(r => setStore(r.data))
         .catch(console.error);
  }, [order.storeId]);

  /* helpers */
  const nameById = useMemo(() => {
    const map = Object.create(null);
    (menu || []).forEach(p => { map[p.id] = p.name ?? p.nombre; });
    return map;
  }, [menu]);

  // products puede venir como JSON o array
  const products = useMemo(() => {
    try {
      return Array.isArray(order.products)
        ? order.products
        : JSON.parse(order.products || "[]");
    } catch {
      return [];
    }
  }, [order.products]);

  // --- Normalizador de extras por línea (acepta array o string JSON) ---
  const parseExtras = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }
    return [];
  };

  const extraLabel = (e = {}) => {
    // En la DB suele venir { code, label, amount } — mostramos el label.
    const label = e.label ?? e.name ?? e.code ?? "extra";
    return String(label);
  };

  // Desduplicado simple por texto de extra (por si el backend duplica registros)
  const uniqLabels = (arr) => {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const t = extraLabel(x);
      if (!seen.has(t)) { seen.add(t); out.push(t); }
    }
    return out;
  };

  /* fecha formateada */
  const f     = moment(order.date).locale("es");
  const fecha = f.format("DD/MM/YY");
  const hora  = f.format("HH:mm");

  /* IDs y URL del QR */
  const customerCode =
      order.customerCode
   ?? order.customer?.code
   ?? (order.customerId ? `CUS-${order.customerId}` : "N/A");

  const orderCode = order.code ?? `ORD-${order.id}`;
  const qrURL = `${window.location.origin}/customer/${orderCode}`;

  /* ─────────────── render ─────────────── */
  const storeName = store?.storeName ? `Pizzería ${store.storeName}` : "Pizzería";

  return (
    <div className="tkt">
      {/* ── Encabezado ── */}
      <div className="tkt-head">
        <strong>{storeName}</strong><br />
        {fecha} {hora}<br />
        {customerCode}<br />{orderCode}
      </div>

      {/* ── Productos ── */}
      <table className="tkt-items"><tbody>
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

              {!!p.notes && (
                <tr>
                  <td colSpan={2} className="p-notes">
                    Obs.: {p.notes}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody></table>

      {/* ── Total ── */}
      <div className="tkt-total">
        Total:&nbsp;{Number(order.total ?? 0).toFixed(2)}&nbsp;€
      </div>
      <div className="tkt-sep" />

      {/* ── Tipo ── */}
      <div className="tkt-type">{order.type}</div>

      {/* ── QR principal ── */}
      <div className="tkt-qr">
        <QRCode value={qrURL} size={120} style={{ background: "#fff", padding: 4 }} />
      </div>

      {/* Observaciones opcionales del pedido */}
      {order.notes && (
        <div className="tkt-notes">
          <strong>Obs.:</strong> {order.notes}
        </div>
      )}

      {/* ── Pie ── */}
      <div className="tkt-foot">
        <span className="tkt-thanks">Gracias por su pedido</span>
        <div className="tkt-sep" />
        {store ? (
          <div className="tkt-contact">
            Tel: {store.tlf || "-"}<br />{store.address}
          </div>
        ) : "Cargando…"}
      </div>

      {/* ── Estilos in-line para el PDF/impresora ── */}
      <style>{`
        .tkt{font-family:monospace;width:100%;max-width:58mm;font-size:11px;text-align:center}
        .tkt-head{margin-bottom:4px}
        .tkt-items{width:100%;border-top:1px dashed #000;margin:4px 0}
        .tkt-items td{padding:2px 0}
        .tkt-items .amt{text-align:right}
        /* extras y notas bajo cada producto */
        .tkt-items .extras{font-size:10px;text-align:left;opacity:.95;padding-top:0}
        .tkt-items .p-notes{font-size:10px;text-align:left;opacity:.9;padding-top:0}
        .tkt-total{border-top:1px dashed #000;margin-top:4px;padding-top:2px;text-align:right}
        .tkt-sep{border-top:1px dashed #000;margin:2px 0}
        .tkt-type{margin:6px 0}
        .tkt-qr{margin:6px 0}
        .tkt-notes{text-align:left;margin:6px 0}
        .tkt-foot{border-top:1px dashed #000;margin-top:6px;padding-top:4px}
        .tkt-thanks{font-size:9px}
        .tkt-contact{font-size:9px}
      `}</style>
    </div>
  );
}
