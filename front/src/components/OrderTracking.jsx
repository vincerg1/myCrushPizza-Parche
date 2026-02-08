import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../setupAxios";
import "../styles/OrderTracking.css";

export default function OrderTracking() {
  const { code } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await api.get(`/api/sales/seguimiento/${code}`);
        if (!alive) return;
        setData(res.data);
      } catch (e) {
        if (!alive) return;
        setError(
          e.response?.data?.message ||
          "No se pudo obtener el estado del pedido"
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [code]);

  if (loading) {
    return (
      <div className="ot-page">
        <div className="ot-card">Consultando estado del pedido…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ot-page">
        <div className="ot-card ot-error">
          <h2>Error</h2>
          <p>{error}</p>
          <Link to="/venta" className="ot-btn">Volver</Link>
        </div>
      </div>
    );
  }

  const steps = [
    { key: "PREPARING", label: "En preparación" },
    { key: "READY", label: "Listo" },
    { key: "ON_THE_WAY", label: "En camino" }
  ];

  const currentIndex = steps.findIndex(s => s.key === data.stage);

  return (
    <div className="ot-page">
      <div className="ot-card">
        <h2 className="ot-title">Seguimiento de pedido</h2>

        <p className="ot-code">
          Pedido <b>{data.code}</b>
        </p>

        <p className="ot-store">
          {data.storeName}
        </p>

        {/* PROGRESO */}
        <div className="ot-steps">
          {steps.map((s, i) => (
            <div
              key={s.key}
              className={`ot-step ${
                i <= currentIndex ? "active" : ""
              }`}
            >
              <div className="ot-dot" />
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <p className="ot-message">{data.message}</p>

        {/* ESPACIO PUBLICIDAD / INFO */}
        <div className="ot-promo">
          🍕 ¿Sabías que puedes añadir extras a tu próxima pizza?
          <br />
          Pregunta en tienda o escríbenos por WhatsApp.
        </div>

        <Link to="/venta" className="ot-btn">
          Volver a la tienda
        </Link>
      </div>
    </div>
  );
}
