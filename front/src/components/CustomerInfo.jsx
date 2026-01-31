/* ───────────────────── src/components/CustomerInfo.jsx ───────────────────── */
import React, { useEffect, useRef, useState } from "react";
import { useParams }   from "react-router-dom";
import api              from "../setupAxios";          // ← usa baseURL del back

/**
 * Vista del repartidor al escanear el QR
 *  • Tarjeta con datos de la orden (incluye dirección clickable)
 *  • Cronómetro “Elapsed time” desde la fecha de venta
 *  • Botón «Delivered ✓»  →  PATCH público (pasa a «Finalized 👍»)
 *  • Botón «◀ Back»  (history.back)
 *  • Logo MCP al pie
 */
export default function CustomerInfo() {
  const { code } = useParams();           // ej. ORD-48063

  const [data,    setData]    = useState(null);
  const [err,     setErr]     = useState("");
  const [elapsed, setElapsed] = useState("00:00:00");
  const timerRef              = useRef(null);

  /* ───────── helpers fecha ───────── */
  const parseDateSafe = raw => {
    if (!raw) return null;
    if (typeof raw === "number")      return new Date(raw);
    if (/^\d{12,}$/.test(raw))        return new Date(+raw);
    const iso = Date.parse(raw);
    if (!Number.isNaN(iso))           return new Date(iso);
    const m = /^(\d{2})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2})/.exec(raw);
    if (m) {
      const [, dd, MM, yy, hh, mm] = m;
      return new Date(2000+ +yy, +MM-1, +dd, +hh, +mm);
    }
    return null;
  };
  const msToHHMMSS = diff => {
    const hh = String(Math.floor(diff / 3_600_000)).padStart(2,"0");
    const mm = String(Math.floor(diff /   60_000)%60).padStart(2,"0");
    const ss = String(Math.floor(diff /    1_000)%60).padStart(2,"0");
    return `${hh}:${mm}:${ss}`;
  };

  /* ───────── 1) fetch orden ───────── */
  useEffect(() => {
    api.get(`/api/public/customer/${code}`)
      .then(r => {
        console.log("PUBLIC DATA →", r.data);   // ← inspección rápida
        setData(r.data);
      })
      .catch(() => setErr("⛔ Pedido no encontrado"));
  }, [code]);

  /* ───────── 2) cronómetro ───────── */
  useEffect(() => () => clearInterval(timerRef.current), []);

  useEffect(() => {
    clearInterval(timerRef.current);
    if (!data) return;

    const start = parseDateSafe(data.date ?? data.createdAt);
    if (!start) return;

    if (data.deliveredAt) {                       // ya entregado
      setElapsed(msToHHMMSS(parseDateSafe(data.deliveredAt) - start));
      return;
    }
    timerRef.current = setInterval(() => {
      setElapsed(msToHHMMSS(Date.now() - start));
    }, 1_000);
  }, [data]);

  /* ───────── 3) PATCH delivered ───────── */
  const markDelivered = async () => {
    try {
      const { data: res } = await api.patch(`/api/public/customer/${code}/delivered`);
      clearInterval(timerRef.current);
      setData(d => ({ ...d, deliveredAt: res.deliveredAt }));
    } catch {
      alert("❌ No se pudo marcar como entregado.");
    }
  };

  /* ───────── render ───────── */
  if (err)   return <Centered><h2>{err}</h2></Centered>;
  if (!data) return <Centered><p>Loading…</p></Centered>;

  const addr =
      data.addr
   || [data.address_1, data.address].filter(Boolean).join(", ")
   || "";
  const maps = data.lat
    ? `https://www.google.com/maps?q=${data.lat},${data.lng}`
    : `https://www.google.com/maps?q=${encodeURIComponent(addr)}`;

  const isDone = Boolean(data.deliveredAt);

  return (
    <Centered>
      {/* botón back */}
      <button style={backBtn} onClick={() => window.history.back()}>◀ Back</button>

      <div>
        {/* tarjeta */}
        <div style={card}>
          <h1 style={title}>Order information</h1>
          <p style={row}>ID:&nbsp;{data.orderCode}</p>
          {data.name  && <p style={row}>Name:&nbsp;{data.name}</p>}
          {data.phone && (
            <p style={row}>
              Phone:&nbsp;<a href={`tel:${data.phone}`} style={link}>{data.phone}</a>
            </p>
          )}
          {addr && (
            <p style={row}>
              Address:<br/>
              <a href={maps} style={link} target="_blank" rel="noopener noreferrer">
                {addr}
              </a>
            </p>
          )}
          {data.notes && (
            <p style={row}>
              <strong>Notes:</strong><br />
              {data.notes}
            </p>
          )}
        </div>

        {/* cronómetro */}
        <div style={timerBox}>
          <p style={timerLabel}>Elapsed&nbsp;time</p>
          <p style={timer}>{elapsed}</p>
        </div>

        {/* botón Delivered / Finalized */}
        <div style={{ textAlign:"center", marginTop:16 }}>
          <button
            disabled={isDone}
            onClick={!isDone ? markDelivered : undefined}
            style={isDone ? doneBtn : btn}
          >
            {isDone ? "Finalized 👍" : "Delivered ✓"}
          </button>
        </div>
      </div>

      {/* logo */}
      <img src="/mcpSolid01.png" alt="Logo MCP" style={logo} />

      {/* animaciones globales + fuente digital */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
        @keyframes shine{0%{background-position:0 0;}100%{background-position:-200% 0;}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.78;transform:scale(.985);}}
      `}</style>
    </Centered>
  );
}

/* ───────── estilos ───────── */
const Centered = ({ children }) => (
  <div style={{ minHeight:"85vh",display:"flex",flexDirection:"column",
                justifyContent:"space-between",alignItems:"center",
                background:"#f92672",padding:"20px 0" }}>
    {children}
  </div>
);

const backBtn = {
  alignSelf:"flex-start",
  marginLeft:20, marginBottom:10,
  background:"transparent", color:"#fff",
  border:"none", fontSize:18, cursor:"pointer"
};

const card = { width:300,padding:"25px",borderRadius:10,background:"#f6f6f6",
  boxShadow:"0 3px 12px rgba(0,0,0,.12)",fontFamily:"system-ui, sans-serif",
  lineHeight:1.45 };
const title = { marginTop:0,fontSize:"1.4rem" };
const row   = { margin:"8px 0" };
const link  = { color:"#007aff",textDecoration:"none" };

const timerBox   = { margin:"32px auto 0",width:300,height:150,border:"3px dashed #ffffff",
  borderRadius:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" };
const timerLabel = { margin:0,fontSize:18,fontStyle:'italic',color:"#ffffff" };
const timer      = { margin:0,fontSize:"4rem",fontWeight:900,color:"#ffffff",fontFamily:"'Share Tech Mono', monospace" };

const baseBtn = {
  padding: "15px 90px",
  fontSize: 18,
  fontWeight: 600,
  borderRadius: 6,
  border: "none",
  cursor: "pointer"
};

const btn = {
  ...baseBtn,
  background: "linear-gradient(90deg,#ffffff 0%,#f6f6f6 50%,#ffffff 100%)",
  backgroundSize: "400% 100%",
  color: "#f92672",
  animation: "shine 3s linear infinite, pulse 2.4s ease-in-out infinite"
};

const doneBtn = {
  ...baseBtn,
  background: "#f6f6f6",
  color: "#f92672"
};

const logo = { width:120, height:"auto", marginTop:4 };
