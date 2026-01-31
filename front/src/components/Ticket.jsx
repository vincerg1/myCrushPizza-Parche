// src/components/Ticket.jsx
import React, { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import moment from "moment";
import "moment/dist/locale/es";
import api from "../setupAxios";
import "../styles/Ticket.css";

export default function Ticket({ order, autoPrint = false }) {
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

  const nameById = useMemo(() => {
    const m = {};
    menu.forEach(p => (m[p.id] = p.name ?? p.nombre));
    return m;
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

  useEffect(() => {
    if (autoPrint) setTimeout(() => window.print(), 300);
  }, [autoPrint]);

  const f = moment(order.date).locale("es");

  return (
    <div className="ticket">
      <div className="ticket-header">
        <strong>{store?.storeName || "Pizzería"}</strong><br />
        {f.format("DD/MM/YY HH:mm")}<br />
        {order.customerCode || `CUS-${order.customerId}`}<br />
        {order.code || `ORD-${order.id}`}
      </div>

      <div className="ticket-items">
        <table>
          <tbody>
            {products.map((p, i) => (
              <tr key={i}>
                <td>{p.name || nameById[p.pizzaId]}</td>
                <td className="right">{p.size} ×{p.qty ?? 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ticket-total">
        Total: {Number(order.total || 0).toFixed(2)} €
      </div>

      <div className="ticket-type">{order.type}</div>

      <div className="ticket-qr">
        <QRCode value={`${window.location.origin}/customer/${order.code}`} size={110} />
      </div>

      <div className="ticket-footer">
        Gracias por su pedido<br />
        {store?.address}
      </div>
    </div>
  );
}
