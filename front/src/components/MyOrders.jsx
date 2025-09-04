// ─────────────────────────────────────────────────────────
// src/components/MyOrders.jsx
//   • Botón/interruptor "Recibir pedidos" (ON/OFF) para la tienda logueada
//   • Carga estado inicial desde GET /api/stores/:id/accepting
//   • Actualiza con PATCH /api/stores/:id/accepting { accepting: boolean }
//   • Añadido id="pending-tab" al botón de pendientes → permite parpadeo.
// ─────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import LocalSaleForm    from "./LocalSaleForm";
import DeliverySaleForm from "./DeliverySaleForm";
import PendingTable     from "./PendingTable";
import { useAuth }      from "./AuthContext";
import api              from "../setupAxios";
import "../styles/MyOrders.css";

/* ───────────────── Login ───────────────── */
function LoginForm() {
  const { login }       = useAuth();
  const [user, setU]    = useState("");
  const [pass, setP]    = useState("");
  const [err , setErr ] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      const { data } = await api.post("/api/auth/login", { user, pass });
      login(data);
    } catch {
      setErr("Credenciales inválidas");
    }
  };

  return (
    <form onSubmit={onSubmit} className="login-form">
      <h3>Sign in</h3>
      <input value={user} onChange={(e) => setU(e.target.value)} required />
      <input value={pass} onChange={(e) => setP(e.target.value)} type="password" required />
      {err && <small style={{ color: "red" }}>{err}</small>}
      <button>Login</button>
    </form>
  );
}

/* ───────────────── Dash ───────────────── */
function Dashboard() {
  const { auth, logout } = useAuth();
  const isAdmin   = auth.role === "admin";
  const myStoreId = auth?.storeId ?? null;

  // vista nivel-1: "pending" | "newsale"
  const [view, setView] = useState("pending");
  // vista nivel-2 (dentro de newsale)
  const [sub , setSub ] = useState("local");

  // Interruptor: recibir pedidos
  const [accepting, setAccepting]     = useState(true);
  const [loadingAcc, setLoadingAcc]   = useState(!!myStoreId);
  const [accErr, setAccErr]           = useState("");

  // cargar estado inicial del switch
  useEffect(() => {
    if (!myStoreId) return;
    setLoadingAcc(true);
    api.get(`/api/stores/${myStoreId}/accepting`)
      .then(r => setAccepting(!!r.data?.accepting))
      .catch(() => {})
      .finally(() => setLoadingAcc(false));
  }, [myStoreId]);

  const toggleAccepting = async () => {
    if (!myStoreId) return;
    const next = !accepting;
    setAccepting(next); // optimista
    try {
      await api.patch(`/api/stores/${myStoreId}/accepting`, { accepting: next });
      setAccErr("");
    } catch (e) {
      setAccepting(!next); // revertir
      setAccErr(e?.response?.data?.error || "No se pudo cambiar el estado");
      setTimeout(() => setAccErr(""), 3000);
    }
  };

  // estilos inline para el switch (sin depender del CSS)
  const swStyle = {
    position: "relative",
    width: 54,
    height: 28,
    borderRadius: 999,
    border: "none",
    padding: 0,
    cursor: loadingAcc ? "not-allowed" : "pointer",
    background: accepting ? "#16a34a" : "#9ca3af",
    transition: "background .15s ease",
  };
  const knobStyle = {
    position: "absolute",
    top: 3,
    left: 3,
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "#fff",
    transform: accepting ? "translateX(26px)" : "translateX(0px)",
    transition: "transform .2s ease",
    boxShadow: "0 1px 2px rgba(0,0,0,.25)",
  };

  return (
    <div className="orders-dashboard">
      {/* cabecera */}
      <header className="dash-head" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span>Logged as {isAdmin ? "Admin" : auth.storeName}</span>

        {/* Interruptor solo para role 'store' (puedes habilitarlo también para admin si lo necesitas) */}
        {!isAdmin && myStoreId && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, opacity: .9 }}>Recibir pedidos</span>
            <button
              style={swStyle}
              onClick={toggleAccepting}
              disabled={loadingAcc}
              aria-pressed={accepting}
              aria-label={accepting ? "Recibir pedidos: ON" : "Recibir pedidos: OFF"}
              title={accepting ? "ON" : "OFF"}
            >
              <span style={knobStyle} />
            </button>
          </div>
        )}

        {!isAdmin && (
          <button onClick={logout}>Logout</button>
        )}
      </header>

      {accErr && (
        <div className="pc-alert" style={{ margin: "8px 0" }}>
          {accErr}
        </div>
      )}

      {/* botones de nivel-1 */}
      <div style={{ marginBottom: 12 }}>
        <button
          id="pending-tab"
          className="level1-btn"
          onClick={() => setView("pending")}
          disabled={view === "pending"}
        >
          Pending orders
        </button>

        <button
          onClick={() => setView("newsale")}
          disabled={view === "newsale"}
          className="level1-btn"
          style={{ marginLeft: 8 }}
        >
          New sale
        </button>
      </div>

      {/* Vista Pending */}
      {view === "pending" && <PendingTable />}

      {/* Vista New sale */}
      {view === "newsale" && (
        <>
          {/* tabs local/delivery SOLO admin */}
          {isAdmin && (
            <div style={{ marginBottom: 8 }}>
              <button onClick={() => setSub("local")}    disabled={sub === "local"}>Local</button>
              <button onClick={() => setSub("delivery")} disabled={sub === "delivery"} style={{ marginLeft: 8 }}>
                Delivery
              </button>
            </div>
          )}

          {/* Contenido según tab */}
          {sub === "local"    && <LocalSaleForm    onDone={() => setView("pending")} />}
          {sub === "delivery" && <DeliverySaleForm onDone={() => setView("pending")} />}
        </>
      )}
    </div>
  );
}

/* ─────────── Gate ─────────── */
export default function MyOrdersGate() {
  const { auth } = useAuth();
  return auth ? <Dashboard /> : <LoginForm />;
}
