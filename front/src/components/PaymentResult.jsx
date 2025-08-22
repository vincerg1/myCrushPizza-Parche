// src/pages/PaymentResult.jsx
import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import api from "../setupAxios";
import "../styles/PublicCheckout.css";

export default function PaymentResult() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Verificando pago…");
  const [ok, setOk] = useState(false);

  const status = (params.get("status") || "").toLowerCase();  // success / cancel
  const order  = params.get("order") || "";
  const sid    = params.get("session_id") || "";

  useEffect(() => {
    let t;
    (async () => {
      if (status !== "success") {
        setOk(false);
        setMsg("Pago no completado.");
        t = setTimeout(() => navigate("/venta", { replace: true }), 4000);
        return;
      }
      try {
        const { data } = await api.post("/api/venta/checkout/confirm", {
          sessionId: sid || undefined,
          orderCode: order || undefined,
        });
        if (data?.paid) {
          setOk(true);
          setMsg("¡Pago confirmado! Tu pedido ya está en preparación.");
        } else {
          setOk(false);
          setMsg("Pago aún no confirmado. Si ya pagaste, espera unos segundos…");
        }
      } catch (e) {
        setOk(false);
        setMsg(e.response?.data?.error || "Error verificando el pago.");
      } finally {
        t = setTimeout(() => navigate("/venta", { replace: true }), 4000);
      }
    })();

    return () => clearTimeout(t);
  }, [status, order, sid, navigate]);

  return (
    <div className="pc-page">
      <div className="pc-wrap">
        <div className="pc-card" style={{ textAlign: "center" }}>
          <h2 className="pc-title">
            {ok ? "¡Gracias por tu compra!" : "Resultado del pago"}
          </h2>

          {order && <p className="pc-note">Pedido: <b>{order}</b></p>}
          <p className="pc-note" style={{ marginTop: 8 }}>{msg}</p>

          <p className="pc-note" style={{ marginTop: 12 }}>
            Volvemos a <b>/venta</b> en unos segundos…
          </p>

          <div className="pc-actions" style={{ marginTop: 12, justifyContent: "center" }}>
            <Link className="pc-btn pc-btn-primary" to="/venta">Volver ahora</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
