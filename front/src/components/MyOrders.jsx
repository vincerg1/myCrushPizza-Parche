// src/components/MyOrders.jsx
//   • DirectPay incluido (monto → enlace Stripe)

import React, { useEffect, useState } from "react";
import LocalSaleForm    from "./LocalSaleForm";
import DeliverySaleForm from "./DeliverySaleForm";
import PendingTable     from "./PendingTable";
import { useAuth }      from "./AuthContext";
import api              from "../setupAxios";
import "../styles/MyOrders.css";
import WhatsAppPanel from "./WhatsAppPanel";

/* ───────────────── Login ───────────────── */
function LoginForm() {
  const { login } = useAuth();
  const [user, setU] = useState("");
  const [pass, setP] = useState("");
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
  const isAdmin = auth?.role === "admin";

  const [view, setView] = useState("pending");
  const [sub , setSub ] = useState("local");

  // DirectPay modal
  const [showDirectPay, setShowDirectPay] = useState(false);
  const [amount, setAmount] = useState("");
  const [link, setLink] = useState("");
  const [loadingDP, setLoadingDP] = useState(false);
  const [errorDP, setErrorDP] = useState("");

  // Switch global de la app
  const [appAccepting, setAppAccepting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (auth?.role !== "admin") return;
    (async () => {
      try {
        const { data } = await api.get("/api/app/status");
        setAppAccepting(!!data.accepting);
      } catch {}
    })();
  }, [auth?.role]);

  const toggleGlobal = async () => {
    if (auth?.role !== "admin" || saving) return;
    const next = !appAccepting;
    setSaving(true);
    try {
      await api.patch("/api/app/status", { accepting: next });
      const { data } = await api.get("/api/app/status");
      setAppAccepting(!!data.accepting);
      setErr("");
    } catch (e) {
      if (e?.response?.status === 401) setErr("Sesión inválida, reingresa como Admin.");
      else if (e?.response?.status === 403) setErr("Solo Admin puede usar esto.");
      else setErr(e?.response?.data?.error || "Error al cambiar estado");
    } finally {
      setSaving(false);
    }
  };

  /* ───────── Direct Pay Handler (con shortener) ───────── */
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
      // 1) pedir enlace largo al backend de ventas
      const { data } = await api.post("/api/venta/direct-pay", { amount: amt });

      if (!data?.success || !data?.url) {
        throw new Error(data?.error || "No se pudo crear el enlace");
      }

      const longUrl = data.url;
      let finalUrl = longUrl;

      // 2) intentar acortar con pay.mycrushpizza.com
      try {
        const resp = await fetch("https://pay.mycrushpizza.com/api/shorten", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: longUrl }),
        });

        if (resp.ok) {
          const shortData = await resp.json();
          if (shortData?.shortUrl) {
            finalUrl = shortData.shortUrl;
          }
        }
      } catch (errShort) {
        console.warn("Shortener error, usando URL larga:", errShort?.message || errShort);
        // si falla el shortener seguimos con la URL larga
      }

      // 3) guardar el link que se mostrará / copiará
      setLink(finalUrl);
    } catch (e) {
      setErrorDP(e?.response?.data?.error || e.message || "Error creando enlace");
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

  /* ───────── Modal DirectPay Styles ───────── */
  const modalWrap = {
    position: "fixed", top:0, left:0, right:0, bottom:0,
    background:"rgba(0,0,0,0.45)", display:"flex",
    justifyContent:"center", alignItems:"center", zIndex:9999
  };
  const modalBox = {
    background:"#fff", padding:20, borderRadius:10,
    width:"90%", maxWidth:360, textAlign:"center"
  };

  const logoutBtn = {
    marginLeft: 8, padding: "6px 10px",
    border: "none", borderRadius: 10,
    background: "#ff6b6b", color: "#fff",
    fontWeight: 600, cursor: "pointer",
    boxShadow: "0 2px 6px #0001"
  };

  return (
    <div className="orders-dashboard">
      <header className="dash-head" style={{ display:"flex", alignItems:"center", gap:12 }}>
        {/* <span>Logged as {isAdmin ? "Admin" : auth.storeName}</span>
        <button type="button" style={logoutBtn} onClick={logout}>Logout</button> */}

        {isAdmin && (
          <div style={{ marginLeft:"auto" }}>
            <span style={{ marginRight:6 }}>App online</span>
            <button
              type="button"
              onClick={toggleGlobal}
              aria-pressed={appAccepting}
              style={{
                background: appAccepting ? "#16a34a" : "#9ca3af",
                width:54, height:28, borderRadius:999,
                cursor:"pointer", border:"none"
              }}
            >
              <span
                style={{
                  display:"block", width:22, height:22, background:"#fff",
                  borderRadius:"50%", margin:3,
                  transform: appAccepting ? "translateX(26px)" : "translateX(0px)",
                  transition:"transform .2s"
                }}
              />
            </button>
          </div>
        )}
      </header>

      {err && <div className="pc-alert" style={{ margin:"8px 0" }}>{err}</div>}

      {/* NAV Buttons */}
      <div style={{ marginBottom:12 }}>
        <button className="level1-btn" disabled={view==="pending"} onClick={()=>setView("pending")}>
          Pending orders
        </button>
        <button className="level1-btn" style={{ marginLeft:8 }} disabled={view==="newsale"} onClick={()=>setView("newsale")}>
          New sale
        </button>
        <button
          className="level1-btn"
          style={{ marginLeft:8, background:"#2563eb", color:"#fff" }}
          onClick={()=>setShowDirectPay(true)}
        >
          Direct Pay
        </button>
        {/* <button
          className="level1-btn"
          style={{ marginLeft:8 }}
          disabled={view==="whatsapp"}
          onClick={()=>setView("whatsapp")}
        >
          WhatsApp
        </button> */}
      </div>

      {/* CONTENT */}
      {view === "whatsapp" && <WhatsAppPanel />}
      {view === "pending" && <PendingTable />}
      {view === "newsale" && (
        <>
          {isAdmin && (
            <div style={{ marginBottom:8 }}>
              <button onClick={()=>setSub("local")} disabled={sub==="local"}>Local</button>
              <button onClick={()=>setSub("delivery")} disabled={sub==="delivery"} style={{ marginLeft:8 }}>
                Delivery
              </button>
            </div>
          )}
          {sub === "local"    && <LocalSaleForm onDone={() => setView("pending")} />}
          {sub === "delivery" && <DeliverySaleForm onDone={() => setView("pending")} />}
        </>
      )}

      {/* DIRECT PAY MODAL */}
      {showDirectPay && (
        <div className="dp-backdrop">
          <div className="dp-modal">
            <h3>Direct Pay</h3>

            <input
              className="dp-input"
              type="number"
              step="0.10"
              min="0"
              placeholder="Amount (€)"
              value={amount}
              onChange={(e)=>setAmount(e.target.value)}
            />

            {errorDP && <p style={{ color:"red", marginTop:8 }}>{errorDP}</p>}

            {link && (
              <div style={{ marginTop: 12 }}>
                <span style={{ display: "block", fontSize: "14px", marginBottom: "6px" }}>
                  Link de pago listo para WhatsApp:
                </span>

                <div
                  onClick={() => navigator.clipboard.writeText(link)}
                  style={{
                    background: "#eee",
                    padding: "10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "14px",
                    color: "#0056b3",
                    textDecoration: "underline",
                    wordBreak: "break-all",
                  }}
                  title="Haz clic para copiar"
                >
                  {link}
                </div>

                <button
                  style={{
                    marginTop: "10px",
                    width: "100%",
                    background: "#16a34a",
                    color: "#fff",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                  onClick={() => navigator.clipboard.writeText(link)}
                >
                  Copiar enlace
                </button>
              </div>
            )}

            {!link && (
              <button className="dp-btn primary" onClick={createDirectPay} disabled={loadingDP}>
                {loadingDP ? "Creating..." : "Create link"}
              </button>
            )}

            <button className="dp-btn gray" onClick={closeDirectPay}>
              Close
            </button>
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
