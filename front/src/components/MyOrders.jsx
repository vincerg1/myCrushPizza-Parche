// ─────────────────────────────────────────────────────────
// src/components/MyOrders.jsx
//   • Añadido id="pending-tab" al botón de pendientes → permite parpadeo.
//   • Sin referencias a variables inexistentes (active / setActive).
// ─────────────────────────────────────────────────────────
import React, { useState } from "react";
import axios               from "axios";
import LocalSaleForm       from "./LocalSaleForm";
import DeliverySaleForm    from "./DeliverySaleForm";
import PendingTable        from "./PendingTable";
import { useAuth }         from "./AuthContext";

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
      const { data } = await axios.post("/api/auth/login", { user, pass });
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

  /* vista nivel‑1: "pending" | "newsale" */
  const [view, setView] = useState("pending");
  /* vista nivel‑2 (dentro de newsale) */
  const [sub , setSub ] = useState("local");

  return (
    <div className="orders-dashboard">
      {/* cabecera */}
      <header className="dash-head">
        <span>
          Logged as {auth.role === "admin" ? "Admin" : auth.storeName}
        </span>
        <button onClick={logout}>Logout</button>
      </header>

      {/* botones de nivel‑1 */}
      <div style={{ marginBottom: 12 }}>
        <button
          id="pending-tab"  /* ← para el parpadeo */
          onClick={() => setView("pending")}
          disabled={view === "pending"}
        >
          Pending orders
        </button>

        <button
          onClick={() => setView("newsale")}
          disabled={view === "newsale"}
          style={{ marginLeft: 8 }}
        >
          New sale
        </button>
      </div>

      {/* Vista Pending */}
      {view === "pending" && <PendingTable />}  {/* muestra tabla */}

      {/* Vista New sale */}
      {view === "newsale" && (
        <>
          {/* tabs local/delivery SOLO admin */}
          {auth.role === "admin" && (
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
