import React, { useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import "../styles/PublicCheckout.css"; // reutiliza estilos .pc-*

export default function PaymentResult() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const status = (params.get("status") || "success").toLowerCase();
  const order  = params.get("order") || "";

  const ok = status === "success";

  useEffect(() => {
    const t = setTimeout(() => navigate("/venta", { replace: true }), 5000);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="pc-page">
      <div className="pc-wrap">
        <div className="pc-card" style={{ textAlign: "center" }}>
          <h2 className="pc-title">
            {ok ? "¡Gracias por tu compra!" : "Pago no completado"}
          </h2>

          {order && <p className="pc-note">Pedido: <b>{order}</b></p>}

          <p className="pc-note" style={{ marginTop: 8 }}>
            {ok
              ? "Hemos recibido tu pedido y ya está en proceso."
              : "Has cancelado el pago. Puedes intentarlo de nuevo cuando quieras."}
          </p>

          <p className="pc-note" style={{ marginTop: 12 }}>
            Te llevamos a <b>/venta</b> en 5 segundos…
          </p>

          <div className="pc-actions" style={{ marginTop: 12, justifyContent: "center" }}>
            <Link className="pc-btn pc-btn-primary" to="/venta">Volver ahora</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
