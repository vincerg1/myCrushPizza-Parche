// src/components/OffersOverview.jsx
import React, { useEffect, useMemo, useState } from "react";

/** ===== Config base de API ===== */
const guessDevBase = () => {
  const { protocol, hostname, port } = window.location;
  if ((hostname === "localhost" || hostname === "127.0.0.1") && port === "3000") {
    return `${protocol}//${hostname}:8080`;
  }
  return "";
};
const API_BASE = (
  window.__API_BASE__ ||
  process.env.REACT_APP_API_BASE ||
  process.env.REACT_APP_API_URL ||
  guessDevBase() ||
  ""
).replace(/\/$/, "");

async function fetchJson(path) {
  const url = /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { credentials: "include" });
  const txt = await res.text();
  try {
    const data = JSON.parse(txt);
    if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  } catch {
    throw new Error(`Respuesta no válida. ${txt.slice(0, 200)}`);
  }
}

/** ===== Utils ===== */
const fmtMoney = (n) => `€ ${Number(n || 0).toFixed(2)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

export default function OffersOverview({ onNavigate = () => {} }) {
  // filtros (para métricas)
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [storeId, setStoreId] = useState("");
  const [segment, setSegment] = useState("");

  // datos
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [kpi, setKpi] = useState({
    issued: 0, redeemed: 0, redemptionRate: null, discountTotal: 0,
    byKind: [], byCodeTop: [], dailySpark: []
  });

  // >>> NUEVO: galería de cupones
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryErr, setGalleryErr] = useState("");
  const [cards, setCards] = useState([]); // [{type,key,title,subtitle,cta,remaining,constraints?,lifetime?}]

  const loadMetrics = async () => {
    setLoading(true); setErr("");
    try {
      const qs = new URLSearchParams();
      qs.set("from", `${from}T00:00:00.000Z`);
      qs.set("to",   `${to}T23:59:59.999Z`);
      if (storeId) qs.set("storeId", String(storeId));
      if (segment) qs.set("segment", segment);
      const data = await fetchJson(`/api/coupons/metrics?${qs.toString()}`);
      setKpi(data.kpi || {});
    } catch (e) {
      console.error(e);
      setErr(e.message || "No se pudo cargar métricas.");
    } finally {
      setLoading(false);
    }
  };

  const loadGallery = async () => {
    setGalleryLoading(true); setGalleryErr("");
    try {
      const data = await fetchJson(`/api/coupons/gallery`);
      setCards(Array.isArray(data.cards) ? data.cards : []);
    } catch (e) {
      console.error(e);
      setGalleryErr(e.message || "No se pudo cargar la galería.");
    } finally {
      setGalleryLoading(false);
    }
  };

  const loadAll = async () => {
    await Promise.all([loadMetrics(), loadGallery()]);
  };

  useEffect(() => { loadAll(); }, []); // carga inicial

  // sparkline
  const spark = useMemo(() => {
    const serie = Array.isArray(kpi.dailySpark) ? kpi.dailySpark : [];
    const W = 360, H = 64, P = 6;
    const values = serie.map(d => d.value || 0);
    const max = Math.max(1, ...values);
    const stepX = serie.length > 1 ? (W - 2*P) / (serie.length - 1) : 0;
    const pts = serie.map((d, i) => {
      const x = P + i * stepX;
      const y = H - P - (d.value / max) * (H - 2*P);
      return `${x},${y}`;
    }).join(" ");
    return { W, H, P, pts, max, last: values.at(-1) || 0, total: values.reduce((a,b)=>a+b,0) };
  }, [kpi.dailySpark]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Offers · Overview</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} />
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} />
          <select value={segment} onChange={e=>setSegment(e.target.value)}>
            <option value="">All segments</option>
            <option value="S1">S1</option><option value="S2">S2</option>
            <option value="S3">S3</option><option value="S4">S4</option>
          </select>
          <input
            placeholder="Store ID (opt)"
            value={storeId}
            onChange={e=>setStoreId(e.target.value.replace(/[^\d]/g,""))}
            style={{ width: 120 }}
          />
          <button className="btn" onClick={loadAll} disabled={loading || galleryLoading}>
            {(loading || galleryLoading) ? "Cargando…" : "Actualizar"}
          </button>
        </div>
      </header>

      {err && <div style={{ color: "crimson" }}>{err}</div>}

      {/* KPIs */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
        <KpiCard title="Cupones emitidos" value={kpi.issued ?? 0} />
        <KpiCard title="Redenciones" value={kpi.redeemed ?? 0} />
        <KpiCard title="Rate de redención"
          value={kpi.redemptionRate == null ? "—" : `${(kpi.redemptionRate*100).toFixed(1)}%`} />
        <KpiCard title="Descuento total" value={fmtMoney(kpi.discountTotal)} />
      </section>

      {/* Actividad + breakdown */}
      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignItems: "stretch" }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
            <strong>Actividad (redenciones por día)</strong>
            <span style={{ opacity:.7, fontSize:12 }}>
              Total: {spark.total} · Último día: {spark.last}
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <svg width="100%" height={spark.H} viewBox={`0 0 ${spark.W} ${spark.H}`} preserveAspectRatio="none">
              <rect x="0" y="0" width={spark.W} height={spark.H} fill="#fafafa" rx="8" />
              <polyline fill="none" stroke="#ff2e73" strokeWidth="2" points={spark.pts} />
            </svg>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
            <strong>Por tipo</strong>
            <div style={{ marginTop: 8, display:"grid", gap:6 }}>
              {(kpi.byKind || []).map(k => (
                <div key={k.kind} style={{ display:"flex", justifyContent:"space-between" }}>
                  <span>{k.kind === "PERCENT" ? "Porcentaje" : "Monto fijo"}</span>
                  <strong>{k.count}</strong>
                </div>
              ))}
              {(!kpi.byKind || !kpi.byKind.length) && <div style={{opacity:.6}}>—</div>}
            </div>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
            <strong>Top códigos</strong>
            <div style={{ marginTop: 8, display:"grid", gap:6 }}>
              {(kpi.byCodeTop || []).map(x => (
                <div key={x.code} style={{ display:"flex", justifyContent:"space-between", fontVariantNumeric:"tabular-nums" }}>
                  <span style={{ opacity:.8 }}>{x.code}</span>
                  <strong>{x.count}</strong>
                </div>
              ))}
              {(!kpi.byCodeTop || !kpi.byCodeTop.length) && <div style={{opacity:.6}}>—</div>}
            </div>
          </div>
        </div>
      </section>

      {/* >>> NUEVO: Galería de cupones disponibles */}
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:8, marginBottom:8 }}>
          <strong>Galería de cupones (stock disponible)</strong>
          <span style={{ fontSize:12, opacity:.65 }}>
            Fuente: <code>/api/coupons/gallery</code>
          </span>
          <div style={{ marginLeft:"auto", fontSize:12, opacity:.75 }}>
            <Legend />
          </div>
        </div>

        {galleryErr && <div style={{ color:"crimson" }}>{galleryErr}</div>}
        {galleryLoading ? (
          <div style={{ opacity:.7 }}>Cargando tarjetas…</div>
        ) : (
          <CardsGrid cards={cards} />
        )}
      </section>

      {/* Acciones rápidas */}
      <section style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        <button className="btn" onClick={() => onNavigate("offers/create")}>➕ Crear oferta</button>
        <button className="btn" onClick={() => onNavigate("offers/sms")}>✉️ Enviar SMS</button>
      </section>
    </div>
  );
}

/** KPI simple */
function KpiCard({ title, value }) {
  return (
    <div style={{ border:"1px solid #e5e7eb", borderRadius:12, padding:14, background:"#fff" }}>
      <div style={{ fontSize:12, opacity:.7 }}>{title}</div>
      <div style={{ fontSize:24, fontWeight:700, marginTop:6, fontVariantNumeric:"tabular-nums" }}>{value}</div>
    </div>
  );
}

/** Leyenda breve para tipos */
function Legend() {
  const tag = (txt) => (
    <span style={{ padding:"2px 8px", border:"1px solid #e5e7eb", borderRadius:999, marginLeft:6, fontSize:12 }}>
      {txt}
    </span>
  );
  return (
    <span>
      Tipos:{tag("RANDOM_PERCENT")}{tag("FIXED_PERCENT")}{tag("FIXED_AMOUNT")}
    </span>
  );
}

/** Grid de tarjetas */
function CardsGrid({ cards }) {
  if (!cards?.length) return <div style={{opacity:.6}}>No hay cupones activos con stock.</div>;
  return (
    <div style={{
      display:"grid",
      gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",
      gap:12
    }}>
      {cards.map((c,i) => <CouponCard key={`${c.type}-${c.key}-${i}`} c={c} />)}
    </div>
  );
}

function CouponCard({ c }) {
  const muted = c.remaining <= 0;
  const badgeBg =
    c.type === "FIXED_AMOUNT" ? "#ffe4ec" :
    c.type === "FIXED_PERCENT" ? "#eaf5ff" :
    "#eef9f0";

  const lifetime =
    c.lifetime?.activeFrom || c.lifetime?.expiresAt
      ? (
        <div style={{ fontSize:11, opacity:.7, marginTop:6 }}>
          {c.lifetime.activeFrom && <>Desde: {new Date(c.lifetime.activeFrom).toLocaleString()}<br/></>}
          {c.lifetime.expiresAt && <>Hasta: {new Date(c.lifetime.expiresAt).toLocaleString()}</>}
        </div>
      ) : null;

  const constraints =
    c.constraints
      ? (
        <div style={{ fontSize:11, opacity:.75, marginTop:6 }}>
          {Array.isArray(c.constraints.daysActive) && c.constraints.daysActive.length
            ? <>Días: {c.constraints.daysActive.join(", ")}</>
            : <>Días: todos</>}
          <br/>
          {c.constraints.windowStart != null || c.constraints.windowEnd != null
            ? <>Ventana: {c.constraints.windowStart ?? 0}–{c.constraints.windowEnd ?? 1440} min</>
            : <>Ventana: libre</>}
        </div>
      ) : null;

  return (
    <div style={{
      border:"1px solid #e5e7eb",
      borderRadius:12,
      padding:12,
      background:"#fff",
      opacity: muted ? .5 : 1
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
        <div style={{ fontSize:12, padding:"2px 8px", background:badgeBg, borderRadius:999 }}>
          {c.type}
        </div>
        <div style={{ fontSize:12, opacity:.65 }}>quedan <b>{c.remaining}</b></div>
      </div>

      <div style={{ fontSize:24, fontWeight:800, marginTop:6 }}>{c.title}</div>
      <div style={{ fontSize:14, opacity:.8 }}>{c.subtitle}</div>

      <button className="btn" style={{ marginTop:10, width:"100%" }} disabled={muted}>
        {c.cta}
      </button>

      {constraints}
      {lifetime}
    </div>
  );
}
