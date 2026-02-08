import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../setupAxios";
import "../styles/OrderTracking.css";

export default function OrderTracking() {
  const { code } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  // ---- fetch reutilizable (solo lectura) ----
  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get(`/api/sales/seguimiento/${code}`);
      setData(res.data);
      setError("");
    } catch (e) {
      setError(
        e.response?.data?.message ||
        "No se pudo obtener el estado del pedido"
      );
    } finally {
      setLoading(false);
    }
  }, [code]);

  // ---- carga inicial ----
  useEffect(() => {
    setLoading(true);
    fetchStatus();
  }, [fetchStatus]);

  // ---- auto refresh SOLO si está en preparación ----
  useEffect(() => {
    if (data?.stage !== "PREPARING") return;

    const interval = setInterval(() => {
      fetchStatus();
    }, 15000); // ⏱ 15s

    return () => clearInterval(interval);
  }, [data?.stage, fetchStatus]);

  // ---- loading / error ----
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

  // ---- pasos ----
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

        <p className="ot-store">{data.storeName}</p>

        {/* PROGRESO */}
        <div className="ot-steps">
          {steps.map((s, i) => (
            <div
              key={s.key}
              className={`ot-step ${i <= currentIndex ? "active" : ""}`}
            >
              <div className="ot-dot" />
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <p className="ot-message">{data.message}</p>

        {/* REFRESCAR CONSULTA */}
        <button
          className="ot-btn ot-btn-secondary"
          onClick={() => {
            setLoading(true);
            fetchStatus();
          }}
        >
          🔄 Actualizar estado
        </button>

        {/* BANNER PUBLICITARIO */}
        <div className="ot-banner">
          <img
            src="https://res.cloudinary.com/djtswalha/image/upload/v1770542789/myCrushPizzaBannerCampa%C3%B1a1_s1qxmk.png"
            alt="MyCrushPizza"
            loading="lazy"
          />
        </div>

        <Link to="/venta" className="ot-btn">
          Volver a la tienda
        </Link>
      </div>
    </div>
  );
}
