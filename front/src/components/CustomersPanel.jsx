import React, { useEffect, useMemo, useState } from "react";

// ─── Service (puedes reemplazar rápidamente por tus endpoints reales) ───
const CustomersAPI = {
  async list({ q = "" } = {}) {
    // 👉 reemplaza por: const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
    // return await res.json();
    // Mock:
    const mock = [
      { id:"c1", name:"Ana Pérez", phone:"+34634122992", email:"ana@email.com", tags:["vip"], isRestricted:false, notes:"Recoge siempre en tienda" },
      { id:"c2", name:"Luis Ramos", phone:"+34604080502", email:"", tags:["promo-sms"], isRestricted:true, notes:"Reporte: no recogió 2 veces" },
      { id:"c3", name:"Marta V.", phone:"+34640245553", email:"marta@email.com", tags:[], isRestricted:false, notes:"" },
    ];
    if (!q) return mock;
    const k = q.toLowerCase();
    return mock.filter(c =>
      [c.name, c.phone, c.email, (c.tags||[]).join(",")].some(v => (v||"").toLowerCase().includes(k))
    );
  },
  async create(payload) {
    // 👉 POST real:
    // const res = await fetch("/api/customers", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
    // return await res.json();
    return { ...payload, id: crypto.randomUUID(), isRestricted:false, tags: payload.tags || [], notes: payload.notes || "" };
  },
  async update(id, payload) {
    // 👉 PATCH real a `/api/customers/${id}`
    return { id, ...payload };
  },
  async toggleRestrict(id, flag) {
    // 👉 PATCH real
    return { id, isRestricted: !!flag };
  }
};

// ─── Helpers ───
function normalizePhone(s="") {
  return s.replace(/[^\d+]/g,"");
}

export default function CustomersPanel() {
  const [loading, setLoading] = useState(true);
  const [error  , setError]   = useState("");
  const [query  , setQuery]   = useState("");
  const [rows   , setRows]    = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [editing , setEditing]  = useState(null); // customer being edited or null

  // Cargar lista
  const load = async (q="") => {
    try {
      setLoading(true);
      setError("");
      const data = await CustomersAPI.list({ q });
      setRows(data);
    } catch (err) {
      console.error(err);
      setError("Could not load customers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Búsqueda con debounce ligero
  useEffect(() => {
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const onSubmitForm = async (form) => {
    try {
      setLoading(true);
      setError("");
      if (editing?.id) {
        const updated = await CustomersAPI.update(editing.id, { ...editing, ...form });
        setRows(prev => prev.map(r => (r.id === editing.id ? { ...r, ...updated } : r)));
      } else {
        const created = await CustomersAPI.create(form);
        setRows(prev => [created, ...prev]);
      }
      setShowForm(false);
      setEditing(null);
    } catch (err) {
      console.error(err);
      setError("Could not save customer.");
    } finally {
      setLoading(false);
    }
  };

  const toggleRestrict = async (cust) => {
    const flag = !cust.isRestricted;
    if (!window.confirm(`${flag ? "Restrict" : "Unrestrict"} ${cust.name || cust.phone}?`)) return;
    try {
      const res = await CustomersAPI.toggleRestrict(cust.id, flag);
      setRows(prev => prev.map(r => (r.id === cust.id ? { ...r, isRestricted: res.isRestricted } : r)));
    } catch (err) {
      console.error(err);
      setError("Could not change restriction status.");
    }
  };

  const startEdit = (cust) => {
    setEditing(cust);
    setShowForm(true);
  };

  return (
    <div className="customers-panel" style={{ maxWidth: 980, margin: "0 auto" }}>
      <header style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <h2 style={{ margin:0 }}>Customers</h2>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn">
          + Add customer
        </button>
        <div style={{ marginLeft:"auto" }}>
          <input
            value={query}
            onChange={e=>setQuery(e.target.value)}
            placeholder="Search by name, phone, email, tag…"
            style={{ padding:"8px 10px", minWidth:280 }}
          />
        </div>
      </header>

      {error && <div style={{ color:"crimson", marginBottom:8 }}>{error}</div>}
      {loading && <div className="small">Loading…</div>}

      {/* Tabla */}
      <div className="table-like" style={{ border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr 1.4fr 1fr 0.9fr 180px", background:"#fafafa", padding:"10px 12px", fontWeight:600 }}>
          <div>Name</div>
          <div>Phone</div>
          <div>Email</div>
          <div>Tags</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {rows.map(c => (
          <div key={c.id} style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr 1.4fr 1fr 0.9fr 180px", padding:"10px 12px", borderTop:"1px solid #eee", alignItems:"center" }}>
            <div title={c.notes || ""}>
              <div style={{ fontWeight:600 }}>{c.name || "—"}</div>
              {c.notes ? <div className="small" style={{ opacity:.7 }}>{c.notes}</div> : null}
            </div>
            <div>{c.phone || "—"}</div>
            <div>{c.email || "—"}</div>
            <div>{(c.tags && c.tags.length) ? c.tags.join(", ") : "—"}</div>
            <div style={{ fontWeight:600, color: c.isRestricted ? "#b45309" : "#059669" }}>
              {c.isRestricted ? "Restricted" : "Active"}
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button className="btn btn-sm" onClick={() => startEdit(c)}>Edit</button>
              <button className="btn btn-sm" onClick={() => toggleRestrict(c)}>
                {c.isRestricted ? "Unrestrict" : "Restrict"}
              </button>
            </div>
          </div>
        ))}
        {!rows.length && !loading && (
          <div style={{ padding:16, textAlign:"center", color:"#6b7280" }}>No customers found.</div>
        )}
      </div>

      {showForm && (
        <CustomerFormModal
          initial={editing || {}}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSubmit={onSubmitForm}
        />
      )}
    </div>
  );
}

// ─── Modal de Alta/Edición ───
function CustomerFormModal({ initial={}, onClose, onSubmit }) {
  const [name , setName ] = useState(initial.name  || "");
  const [phone, setPhone] = useState(initial.phone || "");
  const [email, setEmail] = useState(initial.email || "");
  const [tags , setTags ] = useState((initial.tags||[]).join(", "));
  const [notes, setNotes] = useState(initial.notes || "");

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      phone: normalizePhone(phone),
      email: email.trim(),
      tags: tags.split(",").map(s => s.trim()).filter(Boolean),
      notes: notes.trim(),
    };
    onSubmit(payload);
  };

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.35)",
      display:"grid", placeItems:"center", zIndex:50
    }}>
      <form onSubmit={submit} style={{
        background:"#fff", borderRadius:14, width:520, maxWidth:"92vw",
        boxShadow:"0 10px 30px rgba(0,0,0,.15)", padding:18, display:"grid", gap:12
      }}>
        <div style={{ display:"flex", alignItems:"center" }}>
          <h3 style={{ margin:0 }}>{initial?.id ? "Edit customer" : "Add customer"}</h3>
          <button type="button" onClick={onClose} style={{ marginLeft:"auto" }} className="btn btn-ghost">✕</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <label className="fld">
            <span>Name</span>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="John Doe" />
          </label>
          <label className="fld">
            <span>Phone</span>
            <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+34…" />
          </label>
        </div>

        <label className="fld">
          <span>Email</span>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="john@acme.com" />
        </label>

        <label className="fld">
          <span>Tags (comma separated)</span>
          <input value={tags} onChange={e=>setTags(e.target.value)} placeholder="vip, promo-sms" />
        </label>

        <label className="fld">
          <span>Notes</span>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Internal notes…" />
        </label>

        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" type="submit">{initial?.id ? "Save" : "Create"}</button>
        </div>
      </form>
    </div>
  );
}
