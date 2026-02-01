import React, { useEffect, useState } from "react";
import "../styles/CustomersPanel.css";
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
const buildURL = (path) => (/^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`);

async function httpJSON(path, opts = {}) {
  const url = buildURL(path);
  console.debug("[HTTP]", (opts.method || "GET").toUpperCase(), url);
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    ...opts,
  });
  const raw = await res.text();
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} – ${raw.slice(0, 280)}`);
  if (!ct.includes("application/json")) throw new Error(`Respuesta no-JSON (${ct}). Body: ${raw.slice(0, 280)}`);
  return JSON.parse(raw);
}

const CustomersAPI = {
  async listByPhone({ phoneDigits = "", take = 50, skip = 0 } = {}) {
    const qs = new URLSearchParams();
    if (phoneDigits) qs.set("q", phoneDigits);
    qs.set("take", String(take));
    qs.set("skip", String(skip));
    return httpJSON(`/api/customers/admin?${qs.toString()}`);
  },
  async create(payload) {
    return httpJSON(`/api/customers`, { method: "POST", body: JSON.stringify(payload) });
  },
  async update(id, payload) {
    return httpJSON(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  async remove(id) {
    return httpJSON(`/api/customers/${id}`, { method: "DELETE" });
  },
  async existsPhoneExact(phoneDigits) {
    if (!phoneDigits) return null;
    const { items } = await this.listByPhone({ phoneDigits, take: 5 });
    return items.find(c => normalizePhone(c.phone || "") === phoneDigits) || null;
  },
  async toggleRestrict(id, flag, reason = "") {
    return httpJSON(`/api/customers/${id}/restrict`, {
      method: "PATCH",
      body: JSON.stringify({ isRestricted: flag, reason }),
    });
  },
  async resegment() {
    return httpJSON(`/api/customers/resegment`, { method: "POST" });
  },
  async stats() {
    return httpJSON(`/api/customers/segment-stats`);
  }
};

function normalizePhone(s = "") { return s.replace(/[^\d]/g, ""); }

// UI helpers
const Badge = ({ children, tone = "default" }) => {
  const tones = {
    default: { bg:"#eef2ff", color:"#3730a3", border:"#c7d2fe" }, // indigo
    success: { bg:"#ecfdf5", color:"#065f46", border:"#a7f3d0" }, // green
    warn:    { bg:"#fff7ed", color:"#9a3412", border:"#fed7aa" }, // orange
    gray:    { bg:"#f3f4f6", color:"#374151", border:"#e5e7eb" }
  }[tone] || {};
  return (
    <span style={{
      display:"inline-block", padding:"2px 8px", borderRadius:999,
      fontSize:12, fontWeight:700, background:tones.bg,
      color:tones.color, border:`1px solid ${tones.border}`, lineHeight:1.4
    }}>{children}</span>
  );
};

/** Donut de segmentos S1..S4 (SVG) */
const SEG_COLORS = { S1:"#c7d2fe", S2:"#fecaca", S3:"#bbf7d0", S4:"#fde68a" };
function SegmentDonut({ counts }) {
  const total = Math.max(
    (counts?.S1||0)+(counts?.S2||0)+(counts?.S3||0)+(counts?.S4||0), 0
  ) || 1;
  const order = ["S1","S2","S3","S4"];
  const r = 60, stroke = 22, C = 2*Math.PI*r;

  let acc = 0;
  const arcs = order.map(seg => {
    const v = counts?.[seg] || 0;
    const frac = v / total;
    const len = frac * C;
    const dasharray = `${len} ${C-len}`;
    const dashoffset = -acc * C;
    acc += frac;
    return { seg, dasharray, dashoffset, color: SEG_COLORS[seg] };
  });

  return (
    <div style={{ display:"flex", alignItems:"center", gap:16 }}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        <g transform="translate(80,80)">
          {/* base círculo gris claro */}
          <circle r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke}/>
          {arcs.map(a=>(
            <circle key={a.seg}
              r={r} fill="none"
              stroke={a.color}
              strokeWidth={stroke}
              strokeDasharray={a.dasharray}
              strokeDashoffset={a.dashoffset}
              transform="rotate(-90)"
              strokeLinecap="butt"
            />
          ))}
          {/* agujero interior para efecto donut */}
          <circle r={r-stroke/2-0.5} fill="#fff"/>
        </g>
      </svg>
      <div style={{ display:"grid", gap:6 }}>
        {order.map(seg => (
          <div key={seg} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ width:10, height:10, background:SEG_COLORS[seg], borderRadius:2, border:"1px solid #e5e7eb" }}/>
            <span style={{ width:24 }}>{seg}</span>
            <strong style={{ fontVariantNumeric:"tabular-nums" }}>{counts?.[seg] || 0}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomersPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");   // dígitos
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0 });
  const [stats, setStats] = useState({ total:0, counts:{ S1:0,S2:0,S3:0,S4:0 }, active:{restricted:0,unrestricted:0}, updatedAt:null });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const loadStats = async () => {
    try {
      const s = await CustomersAPI.stats();
      setStats(s);
    } catch (e) {
      console.error(e);
      // no detenemos la UI si fallan métricas
    }
  };

  // carga inicial: últimos 5 + stats
  const loadLatest = async () => {
    setLoading(true); setError("");
    try {
      const [{ items, total }] = await Promise.all([
        CustomersAPI.listByPhone({ phoneDigits:"", take:5 }),
      ]);
      setRows(items); setMeta({ total });
    } catch (e) {
      console.error(e); setError("No se pudo cargar clientes. " + e.message);
    } finally { setLoading(false); }
  };

  const reloadSameFilter = async () => {
    const digits = normalizePhone(query);
    setLoading(true); setError("");
    try {
      if (digits) {
        const { items, total } = await CustomersAPI.listByPhone({ phoneDigits: digits, take:50 });
        setRows(items); setMeta({ total });
      } else {
        const { items, total } = await CustomersAPI.listByPhone({ phoneDigits:"", take:5 });
        setRows(items); setMeta({ total });
      }
    } catch (e) {
      console.error(e); setError("No se pudo refrescar la lista. " + e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    console.info("[CustomersPanel] API_BASE =>", API_BASE || "(vacío / mismo origen)");
    loadLatest();
    loadStats();
  }, []);

  // búsqueda por teléfono (solo dígitos) con debounce
  useEffect(() => {
    const t = setTimeout(async () => {
      const digits = normalizePhone(query);
      if (!digits) { loadLatest(); return; }
      setLoading(true); setError("");
      try {
        const { items, total } = await CustomersAPI.listByPhone({ phoneDigits: digits, take:50 });
        setRows(items); setMeta({ total });
      } catch (e) {
        console.error(e); setError("Error al buscar por teléfono. " + e.message);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const startCreate = () => { setEditing(null); setShowForm(true); };
  const startEdit   = (c) => { setEditing(c);   setShowForm(true); };

  const onSubmitForm = async (form) => {
    const phoneDigits = normalizePhone(form.phone || "");
    if (!phoneDigits) { setError("El teléfono es obligatorio."); return; }

    setLoading(true); setError("");
    try {
      const hit = await CustomersAPI.existsPhoneExact(phoneDigits);
      if (hit && (!editing || hit.id !== editing.id)) {
        setError(`Este teléfono ya existe (${hit.code}).`);
        setLoading(false);
        return;
      }

      if (editing?.id) {
        const updated = await CustomersAPI.update(editing.id, form);
        setRows(prev => prev.map(r => r.id === editing.id ? { ...r, ...updated } : r));
      } else {
        await CustomersAPI.create(form);
        await loadLatest();
      }
      setShowForm(false); setEditing(null);
      loadStats();
    } catch (e) {
      console.error(e);
      const msg = e.message || "";
      const conflict = /phone_exists|unique|duplicad[oa]|constraint/i.test(msg);
      setError(conflict ? "Ese teléfono ya existe." : "No se pudo guardar. " + msg);
    } finally { setLoading(false); }
  };

  const onDeleteCurrent = async (id) => {
    if (!id) return;
    if (!window.confirm("¿Eliminar este cliente? Esta acción no se puede deshacer.")) return;
    setLoading(true); setError("");
    try {
      await CustomersAPI.remove(id);
      await reloadSameFilter();
      setShowForm(false); setEditing(null);
      loadStats();
    } catch (e) {
      console.error(e);
      setError("No se pudo eliminar. " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const onResegment = async () => {
    setError(""); setLoading(true);
    try {
      const r = await CustomersAPI.resegment();
      await reloadSameFilter();
      await loadStats();
      alert(
        `Segmentos actualizados.\n` +
        `Cambiados: ${r.changed}\n` +
        `S1:${r.counts?.S1 ?? 0}  S2:${r.counts?.S2 ?? 0}  S3:${r.counts?.S3 ?? 0}  S4:${r.counts?.S4 ?? 0}\n` +
        `Ticket medio empresa: ${Number(r.companyAvg || 0).toFixed(2)}`
      );
    } catch (e) {
      console.error(e);
      setError("No se pudo recalcular segmentos. " + e.message);
    } finally {
      setLoading(false);
    }
  };

  function displayESPhone(phone = "") {
  const s = String(phone || "").trim();

  // Caso ideal: +34XXXXXXXXX → mostramos solo los 9 dígitos
  const m = s.match(/^\+34(\d{9})$/);
  if (m) return m[1];

  // Caso: viene algo raro → devolvemos solo dígitos finales
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 9) return digits.slice(-9);

  return s;
}

  return (
    <div className="customers-panel">
      {/* Header */}
<header className="customers-header">
  <div className="customers-header-left">
    <h2>Customers</h2>
    <button onClick={onResegment} className="btn btn-ghost">
      Actualizar segmentos
    </button>
  </div>

  <div className="customers-header-right">
    <input
      value={query}
      onChange={(e) => setQuery(normalizePhone(e.target.value))}
      placeholder="Search by phone…"
      className="customers-search"
    />
    <button onClick={startCreate} className="btn-primary">
      + Add customer
    </button>
  </div>
</header>


      {/* Stats card */}
      <section style={{
        display:"grid",
        gridTemplateColumns:"auto 1fr",
        gap:24,
        alignItems:"center",
        border:"1px solid #e5e7eb",
        borderRadius:12,
        padding:16,
        marginBottom:16
      }}>
        <SegmentDonut counts={stats.counts} />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5, minmax(0,1fr))", gap:12 }}>
          {["S1","S2","S3","S4"].map(seg=>(
            <div key={seg} style={{ padding:12, border:"1px solid #f3f4f6", borderRadius:10, background:"#fafafa" }}>
              <div className="small" style={{ opacity:.7 }}>Segment {seg}</div>
              <div style={{ fontSize:22, fontWeight:700, fontVariantNumeric:"tabular-nums" }}>
                {stats?.counts?.[seg] ?? 0}
              </div>
            </div>
          ))}
          <div style={{ padding:12, border:"1px solid #f3f4f6", borderRadius:10, background:"#fff" }}>
            <div className="small" style={{ opacity:.7 }}>Total</div>
            <div style={{ fontSize:22, fontWeight:700, fontVariantNumeric:"tabular-nums" }}>
              {stats?.total ?? 0}
            </div>
            <div className="small" style={{ marginTop:6, opacity:.8 }}>
              Activos: {stats?.active?.unrestricted ?? 0} · Restrict: {stats?.active?.restricted ?? 0}
            </div>
          </div>
        </div>
      </section>

      {/* Lista */}
      <div className="table-like" style={{ border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden" }}>
        {/* Cabecera sin email */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"120px 1fr 160px 90px 120px 200px",
          background:"#fafafa", padding:"10px 12px", fontWeight:600
        }}>
          <div>Code</div>
          <div>Name</div>
          <div>Phone</div>
          <div>Segment</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {rows.map((c, i) => (
          <div key={c.id} style={{
            display:"grid",
            gridTemplateColumns:"120px 1fr 160px 90px 120px 200px",
            padding:"12px", borderTop:"1px solid #eee", alignItems:"center",
            background: i % 2 ? "#fcfcfc" : "#fff"
          }}>
            <div style={{fontVariantNumeric:"tabular-nums"}}>{c.code}</div>
            <div title={c.observations || ""}>
              <div style={{ fontWeight:600 }}>
                {(c.name || "—").toUpperCase()}
              </div>
              {c.observations ? <div className="small" style={{ opacity:.7 }}>{c.observations}</div> : null}
            </div>
            <div>{displayESPhone(c.phone) || "—"}</div>
            <div><Badge tone="default">{c.segment || "—"}</Badge></div>
            <div>
              {c.isRestricted
                ? <Badge tone="warn">Restricted</Badge>
                : <Badge tone="success">Active</Badge>}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button className="btn btn-sm" onClick={() => startEdit(c)}>Edit</button>
              <button className="btn btn-sm" onClick={async () => {
                const flag = !c.isRestricted;
                const reason = flag ? (prompt("Reason for restriction (optional):") || "") : "";
                try {
                  const up = await CustomersAPI.toggleRestrict(c.id, flag, reason);
                  setRows(prev => prev.map(r => r.id === c.id ? { ...r, ...up } : r));
                  loadStats();
                } catch (e) {
                  console.error(e); alert("No se pudo cambiar el estado de restricción.");
                }
              }}>{c.isRestricted ? "Unrestrict" : "Restrict"}</button>
            </div>
          </div>
        ))}

        {!rows.length && !loading && (
          <div style={{ padding:16, textAlign:"center", color:"#6b7280" }}>No customers.</div>
        )}
      </div>

      {error && <div style={{ color:"crimson", marginTop:10 }}>{error}</div>}

      {showForm && (
        <CustomerFormModal
          initial={editing || {}}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSubmit={onSubmitForm}
          onDelete={editing?.id ? () => onDeleteCurrent(editing.id) : null}
        />
      )}
    </div>
  );
}

/* Modal (sin cambios funcionales) */
function CustomerFormModal({ initial = {}, onClose, onSubmit, onDelete }) {
  const [name, setName] = useState(initial.name || "");
  const [phone, setPhone] = useState(initial.phone || "");
  const [email, setEmail] = useState(initial.email || "");
  const [address, setAddress] = useState(initial.address_1 || "");
  const [portal, setPortal] = useState(initial.portal || "");
  const [obs, setObs] = useState(initial.observations || "");

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      name: name.trim() || null,
      phone: phone.trim(),
      email: email.trim() || null,
      address_1: address.trim(),
      portal: portal.trim() || null,
      observations: obs.trim() || null,
    };
    onSubmit(payload);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.35)", display:"grid", placeItems:"center", zIndex:50 }}>
      <form onSubmit={submit} style={{ background:"#fff", borderRadius:14, width:560, maxWidth:"92vw", boxShadow:"0 10px 30px rgba(0,0,0,.15)", padding:18, display:"grid", gap:12 }}>
        <div style={{ display:"flex", alignItems:"center" }}>
          <h3 style={{ margin:0 }}>{initial?.id ? "Edit customer" : "Add customer"}</h3>
          <button type="button" onClick={onClose} style={{ marginLeft:"auto" }} className="btn btn-ghost">✕</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <label className="fld">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
          </label>
          <label className="fld">
            <span>Phone *</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Solo dígitos…" />
          </label>
        </div>
        <label className="fld">
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@acme.com" />
        </label>

        <label className="fld">
          <span>Address (address_1)</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Opcional. Se autogenera si no lo indicas." />
        </label>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <label className="fld">
            <span>Portal</span>
            <input value={portal} onChange={(e) => setPortal(e.target.value)} placeholder="Portal / piso / puerta" />
          </label>
          <label className="fld">
            <span>Observations</span>
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Notas internas…" />
          </label>
        </div>

        <div style={{ display:"flex", gap:8, justifyContent:"space-between", alignItems:"center" }}>
          {onDelete && initial?.id ? (
            <button
              type="button"
              onClick={onDelete}
              className="btn"
              style={{ background:"#dc2626", color:"#fff", border:"1px solid #b91c1c" }}
              title="Eliminar este cliente"
            >
              Delete
            </button>
          ) : <span />}

          <div style={{ display:"flex", gap:8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn" type="submit">{initial?.id ? "Save" : "Create"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
