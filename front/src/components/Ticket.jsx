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
       .catch(err => {
         console.error(err);
         setMenu([]);
       });
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
  const qrURL     = `${window.location.origin}/customer/${orderCode}`;

  /* ─────────────── render ─────────────── */
  const storeName = store?.storeName
    ? `Pizzería ${store.storeName}`
    : "Pizzería";

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
        {products.map((p, i) => (
          <tr key={i}>
            <td>{nameById[p.pizzaId] || `#${p.pizzaId}`}</td>
            <td className="amt">{p.size} ×{p.qty}</td>
          </tr>
        ))}
      </tbody></table>

      {/* ── Total ── */}
      <div className="tkt-total">
        Total:&nbsp;{Number(order.total).toFixed(2)}&nbsp;€
      </div>
      <div className="tkt-sep" />

      {/* ── Tipo ── */}
      <div className="tkt-type">{order.type}</div>

      {/* ── QR principal ── */}
      <div className="tkt-qr">
        <QRCode
          value={qrURL}
          size={120}
          style={{ background: "#fff", padding: 4 }}
        />
      </div>

      {/* Observaciones opcionales */}
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
