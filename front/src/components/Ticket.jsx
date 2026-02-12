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

  const globalExtras = useMemo(() => {
    try {
      return Array.isArray(order.extras)
        ? order.extras
        : JSON.parse(order.extras || "[]");
    } catch {
      return [];
    }
  }, [order.extras]);

  useEffect(() => {
    if (autoPrint) setTimeout(() => window.print(), 300);
  }, [autoPrint]);

  const f = moment(order.date).locale("es");

  const safeExtras = (arr) => Array.isArray(arr) ? arr : [];

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

            {/* 🔹 PRODUCTOS */}
            {products.map((p, i) => (
              <React.Fragment key={i}>
                <tr>
                  <td>
                    {p.name || nameById[p.pizzaId]}
                  </td>
                  <td className="right">
                    {p.size} ×{p.qty ?? 1}
                  </td>
                </tr>

                {/* 🔹 EXTRAS POR PRODUCTO */}
                {safeExtras(p.extras).map((ex, j) => {
                  const amount = Number(ex.amount || 0);
                  return (
                    <tr key={`ex-${i}-${j}`} className="ticket-extra">
                      <td style={{ paddingLeft: "12px" }}>
                        + {ex.label || ex.name}
                      </td>
                      <td className="right">
                        {amount > 0 ? `${amount.toFixed(2)} €` : ""}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}

            {/* 🔹 EXTRAS GLOBALES (delivery, etc.) */}
            {safeExtras(globalExtras)
              .filter(ex => String(ex.code || "").toUpperCase() !== "COUPON")
              .map((ex, i) => {
                const amount = Number(ex.amount || 0);
                if (!Number.isFinite(amount) || amount === 0) return null;

                return (
                  <tr key={`gex-${i}`} className="ticket-extra-global">
                    <td>
                      {ex.label || ex.code}
                    </td>
                    <td className="right">
                      {amount > 0
                        ? `${amount.toFixed(2)} €`
                        : `-${Math.abs(amount).toFixed(2)} €`}
                    </td>
                  </tr>
                );
              })}

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
