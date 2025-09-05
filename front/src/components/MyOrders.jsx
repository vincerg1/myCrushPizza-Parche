// src/components/MyOrders.jsx
//   • Switch global "App online" (solo Admin) → /api/app/status (GET/PATCH)
//   • Botón Pending con id="pending-tab"
//   • Sin logout duplicado ni controles por tienda
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
  const { auth } = useAuth();
  const isAdmin = auth?.role === "admin";

  // vista nivel-1: "pending" | "newsale"
  const [view, setView] = useState("pending");
  // vista nivel-2 (dentro de newsale)
  const [sub , setSub ] = useState("local");

  // Switch global de la app (solo admin)
  const [appAccepting, setAppAccepting] = useState(true);
  const [saving, setSaving]             = useState(false);
  const [errMsg, setErrMsg]             = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const { data } = await api.get("/api/app/status");
        setAppAccepting(!!data.accepting);
      } catch {/* noop */}
    })();
  }, [isAdmin]);

  const toggleGlobal = async () => {
    if (!isAdmin || saving) return;
    const next = !appAccepting;
    setSaving(true);
    try {
      await api.patch("/api/app/status", { accepting: next });
      // refrescamos desde el backend para quedar en estado real
      const { data } = await api.get("/api/app/status");
      setAppAccepting(!!data.accepting);
      setErrMsg("");
    } catch (e) {
      setErrMsg(e?.response?.data?.error || "No se pudo cambiar el estado");
    } finally {
      setSaving(false);
    }
  };

  // estilos switch inline
  const swWrap = { marginLeft:"auto", display:"flex", alignItems:"center", gap:10 };
  const swBtn  = {
    position:"relative", width:54, height:28, borderRadius:999, border:"none", padding:0,
    cursor: saving ? "not-allowed" : "pointer",
    background: appAccepting ? "#16a34a" : "#9ca3af",
    transition:"background .15s ease"
  };
  const swKnob = {
    position:"absolute", top:3, left:3, width:22, height:22, borderRadius:"50%", background:"#fff",
    transform: appAccepting ? "translateX(26px)" : "translateX(0px)",
    transition:"transform .2s ease",
    boxShadow:"0 1px 2px rgba(0,0,0,.25)"
  };

  return (
    <div className="orders-dashboard">
      {/* cabecera */}
      <header className="dash-head" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span>Logged as {isAdmin ? "Admin" : auth.storeName}</span>

        {/* Switch global solo admin */}
        {isAdmin && (
          <div style={swWrap}>
            <span className="pc-note" style={{ fontSize:14 }}>App online</span>
            <button
              style={swBtn}
              onClick={toggleGlobal}
              disabled={saving}
              aria-pressed={appAccepting}
              aria-label={appAccepting ? "App online: ON" : "App online: OFF"}
              title={appAccepting ? "ON" : "OFF"}
            >
              <span style={swKnob}/>
            </button>
          </div>
        )}
      </header>

      {/* error del switch */}
      {errMsg && <div className="pc-alert" style={{ margin: "8px 0" }}>{errMsg}</div>}

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
