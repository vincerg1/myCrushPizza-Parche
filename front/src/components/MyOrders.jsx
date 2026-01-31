// src/components/MyOrders.jsx
//   • DirectPay incluido
//   • Admin puede imprimir tickets (window.print)

import React, { useEffect, useState } from "react";
import LocalSaleForm from "./LocalSaleForm";
import DeliverySaleForm from "./DeliverySaleForm";
import PendingTable from "./PendingTable";
import Ticket from "./Ticket";
import { useAuth } from "./AuthContext";
import api from "../setupAxios";
import "../styles/MyOrders.css";
import WhatsAppPanel from "./WhatsAppPanel";

/* ───────────────── Login ───────────────── */
function LoginForm() {
  const { login } = useAuth();
  const [user, setU] = useState("");
  const [pass, setP] = useState("");
  const [err, setErr] = useState("");

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
      <input
        value={pass}
        onChange={(e) => setP(e.target.value)}
        type="password"
        required
      />
      {err && <small style={{ color: "red" }}>{err}</small>}
      <button>Login</button>
    </form>
  );
}

/* ───────────────── Dashboard ───────────────── */
function Dashboard() {
  const { auth } = useAuth();
  const isAdmin = auth?.role === "admin";

  const [view, setView] = useState("pending");
  const [sub, setSub] = useState("local");

  // impresión admin
  const [printOrder, setPrintOrder] = useState(null);

  // DirectPay modal
  const [showDirectPay, setShowDirectPay] = useState(false);
  const [amount, setAmount] = useState("");
  const [link, setLink] = useState("");
  const [loadingDP, setLoadingDP] = useState(false);
  const [errorDP, setErrorDP] = useState("");

  // App status
  const [appAccepting, setAppAccepting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    api.get("/api/app/status")
      .then(r => setAppAccepting(!!r.data.accepting))
      .catch(() => {});
  }, [isAdmin]);

  const toggleGlobal = async () => {
    if (!isAdmin || saving) return;
    const next = !appAccepting;
    setSaving(true);
    try {
      await api.patch("/api/app/status", { accepting: next });
      const { data } = await api.get("/api/app/status");
      setAppAccepting(!!data.accepting);
      setErr("");
    } catch (e) {
      setErr(e?.response?.data?.error || "Error al cambiar estado");
    } finally {
      setSaving(false);
    }
  };

  /* ───────── Direct Pay ───────── */
  const createDirectPay = async () => {
    setErrorDP("");
    setLink("");

    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setErrorDP("Monto inválido");
      return;
    }

    setLoadingDP(true);
    try {
      const { data } = await api.post("/api/venta/direct-pay", { amount: amt });
      if (!data?.success || !data?.url) throw new Error("No se pudo crear enlace");
      setLink(data.url);
    } catch (e) {
      setErrorDP(e?.message || "Error creando enlace");
    } finally {
      setLoadingDP(false);
    }
  };

  const closeDirectPay = () => {
    setShowDirectPay(false);
    setAmount("");
    setLink("");
    setErrorDP("");
  };

  return (
    <div className="orders-dashboard">
      <header className="dash-head">
        <h2>MyOrdersPanel</h2>

        {isAdmin && (
          <div className="app-toggle">
            <span className="app-toggle-label">App online</span>
            <button
              type="button"
              onClick={toggleGlobal}
              aria-pressed={appAccepting}
              className={`app-toggle-btn ${appAccepting ? "on" : "off"}`}
            >
              <span className="app-toggle-knob" />
            </button>
          </div>
        )}
      </header>

      {err && <div className="pc-alert">{err}</div>}

      {/* NAV */}
      <div style={{ marginBottom: 12 }}>
        <button disabled={view === "pending"} onClick={() => setView("pending")}>
          Pending orders
        </button>
        <button
          disabled={view === "newsale"}
          onClick={() => setView("newsale")}
          style={{ marginLeft: 8 }}
        >
          New sale
        </button>
        <button
          style={{ marginLeft: 8, background: "#f1bb19", color: "#fff" }}
          onClick={() => setShowDirectPay(true)}
        >
          Direct Pay
        </button>
      </div>

      {/* CONTENT */}
      {view === "pending" && (
        <PendingTable
          onPrint={(order) => setPrintOrder(order)}
        />
      )}

      {view === "newsale" && (
        <>
          {isAdmin && (
            <div style={{ marginBottom: 8 }}>
              <button onClick={() => setSub("local")} disabled={sub === "local"}>
                Local
              </button>
              <button
                onClick={() => setSub("delivery")}
                disabled={sub === "delivery"}
                style={{ marginLeft: 8 }}
              >
                Delivery
              </button>
            </div>
          )}
          {sub === "local" && <LocalSaleForm onDone={() => setView("pending")} />}
          {sub === "delivery" && (
            <DeliverySaleForm onDone={() => setView("pending")} />
          )}
        </>
      )}

      {/* ───── Modal impresión ADMIN ───── */}
      {printOrder && (
        <div className="pt-modal-back" onClick={() => setPrintOrder(null)}>
          <div
            className="pt-modal-card"
            style={{ width: "62mm" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Ticket order={printOrder} autoPrint />
            <div className="pt-buttons">
              <button onClick={() => window.print()}>Print</button>
              <button onClick={() => setPrintOrder(null)}>✕</button>
            </div>
          </div>
        </div>
      )}

      {/* ───── Direct Pay Modal ───── */}
      {showDirectPay && (
        <div className="dp-backdrop">
          <div className="dp-modal">
            <h3>Direct Pay</h3>

            <input
              type="number"
              placeholder="Amount (€)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            {errorDP && <p style={{ color: "red" }}>{errorDP}</p>}

            {link ? (
              <>
                <div
                  onClick={() => navigator.clipboard.writeText(link)}
                  style={{ cursor: "pointer", wordBreak: "break-all" }}
                >
                  {link}
                </div>
                <button onClick={() => navigator.clipboard.writeText(link)}>
                  Copiar enlace
                </button>
              </>
            ) : (
              <button onClick={createDirectPay} disabled={loadingDP}>
                {loadingDP ? "Creating..." : "Create link"}
              </button>
            )}

            <button onClick={closeDirectPay}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────── Gate ───────── */
export default function MyOrdersGate() {
  const { auth } = useAuth();
  return auth ? <Dashboard /> : <LoginForm />;
}
