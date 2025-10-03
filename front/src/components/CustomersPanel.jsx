import React, { useEffect, useState } from "react";

async function httpJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json();
}

const CustomersAPI = {
  async list({ q = "", take = 5, skip = 0 } = {}) {
    const u = new URL(`/api/customers/admin`, window.location.origin);
    if (q) u.searchParams.set("q", q);
    u.searchParams.set("take", take);
    u.searchParams.set("skip", skip);
    return httpJSON(u.toString());
  },
  async create(payload) {
    return httpJSON(`/api/customers`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async update(id, payload) {
    return httpJSON(`/api/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  async remove(id) {
    return httpJSON(`/api/customers/${id}`, { method: "DELETE" });
  },
  async toggleRestrict(id, flag, reason = "") {
    return httpJSON(`/api/customers/${id}/restrict`, {
      method: "PATCH",
      body: JSON.stringify({ isRestricted: flag, reason }),
    });
  },
};

function normalizePhone(s = "") {
  return s.replace(/[^\d+]/g, "");
}

export default function CustomersPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ total: 0 });

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  // carga inicial: últimos 5
  const loadLatest = async () => {
    setLoading(true);
    setError("");
    try {
      const { items, total } = await CustomersAPI.list({ take: 5 });
      setRows(items);
      setMeta({ total });
    } catch (e) {
      console.error(e);
      setError("No se pudo cargar clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLatest();
  }, []);

  // búsqueda (usa el mismo endpoint pero con take 50)
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!query.trim()) return loadLatest();
      setLoading(true);
      setError("");
      try {
        const { items, total } = await CustomersAPI.list({
          q: query,
          take: 50,
        });
        setRows(items);
        setMeta({ total });
      } catch (e) {
        console.error(e);
        setError("Error al buscar clientes.");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const startCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const startEdit = (c) => {
    setEditing(c);
    setShowForm(true);
  };

  const onSubmitForm = async (form) => {
    setLoading(true);
    setError("");
    try {
      if (editing?.id) {
        const updated = await CustomersAPI.update(editing.id, form);
        setRows((prev) =>
          prev.map((r) => (r.id === editing.id ? { ...r, ...updated } : r))
        );
      } else {
        await CustomersAPI.create(form);
        // refrescamos lista de “últimos 5”
        await loadLatest();
      }
      setShowForm(false);
      setEditing(null);
    } catch (e) {
      console.error(e);
      const msg = e.message || "";
      const conflict =
        msg.includes("Unique") ||
        /unique|duplicad[oa]|constraint/i.test(msg);
      setError(
        conflict
          ? "Conflicto de datos únicos (teléfono, email o dirección ya existen)."
          : "No se pudo guardar."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="customers-panel" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Customers</h2>
        <button onClick={startCreate} className="btn">+ Add customer</button>
        <div style={{ marginLeft: "auto" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, email, code, address…"
            style={{ padding: "8px 10px", minWidth: 320 }}
          />
        </div>
      </header>

      <div className="small" style={{ marginBottom: 8 }}>
        {query ? `Matches: ${meta.total}` : "Showing latest 5 customers"}
      </div>
      {error && <div style={{ color: "crimson", marginBottom: 8 }}>{error}</div>}
      {loading && <div className="small">Loading…</div>}

      {/* Tabla */}
      <div
        className="table-like"
        style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "120px 1fr 140px 220px 1.2fr 120px 200px", // Code, Name, Phone, Email, Address, Status, Actions
            background: "#fafafa",
            padding: "10px 12px",
            fontWeight: 600,
          }}
        >
          <div>Code</div>
          <div>Name</div>
          <div>Phone</div>
          <div>Email</div>
          <div>Address</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {rows.map((c) => (
          <div
            key={c.id}
            style={{
              display: "grid",
              gridTemplateColumns:
                "120px 1fr 140px 220px 1.2fr 120px 200px",
              padding: "10px 12px",
              borderTop: "1px solid #eee",
              alignItems: "center",
            }}
          >
            <div>{c.code}</div>
            <div title={c.observations || ""}>
              <div style={{ fontWeight: 600 }}>{c.name || "—"}</div>
              {c.observations ? (
                <div className="small" style={{ opacity: 0.7 }}>
                  {c.observations}
                </div>
              ) : null}
            </div>
            <div>{c.phone || "—"}</div>
            <div>{c.email || "—"}</div>
            <div>
              <div>{c.address_1}</div>
              {c.portal ? (
                <div className="small" style={{ opacity: 0.7 }}>{c.portal}</div>
              ) : null}
            </div>
            <div
              style={{
                fontWeight: 600,
                color: c.isRestricted ? "#b45309" : "#059669",
              }}
            >
              {c.isRestricted ? "Restricted" : "Active"}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-sm" onClick={() => startEdit(c)}>
                Edit
              </button>
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const flag = !c.isRestricted;
                  const reason = flag
                    ? (prompt("Reason for restriction (optional):") || "")
                    : "";
                  try {
                    const up = await CustomersAPI.toggleRestrict(
                      c.id,
                      flag,
                      reason
                    );
                    setRows((prev) =>
                      prev.map((r) => (r.id === c.id ? { ...r, ...up } : r))
                    );
                  } catch (e) {
                    console.error(e);
                    alert("No se pudo cambiar el estado de restricción.");
                  }
                }}
              >
                {c.isRestricted ? "Unrestrict" : "Restrict"}
              </button>
              {/* Si quieres permitir borrar:
              <button
                className="btn btn-sm"
                onClick={async () => {
                  if (!window.confirm(`Delete ${c.code}?`)) return;
                  await CustomersAPI.remove(c.id);
                  await loadLatest();
                }}
              >
                Delete
              </button>
              */}
            </div>
          </div>
        ))}

        {!rows.length && !loading && (
          <div style={{ padding: 16, textAlign: "center", color: "#6b7280" }}>
            No customers.
          </div>
        )}
      </div>

      {showForm && (
        <CustomerFormModal
          initial={editing || {}}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSubmit={onSubmitForm}
        />
      )}
    </div>
  );
}

function CustomerFormModal({ initial = {}, onClose, onSubmit }) {
  const [name, setName] = useState(initial.name || "");
  const [phone, setPhone] = useState(initial.phone || "");
  const [email, setEmail] = useState(initial.email || ""); // nuevo
  const [address, setAddress] = useState(initial.address_1 || "");
  const [portal, setPortal] = useState(initial.portal || "");
  const [obs, setObs] = useState(initial.observations || "");

  const submit = (e) => {
    e.preventDefault();
    const payload = {
      name: name.trim() || null,
      phone: normalizePhone(phone) || null,
      email: email.trim() || null,
      address_1: address.trim(),
      portal: portal.trim() || null,
      observations: obs.trim() || null,
    };
    onSubmit(payload);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#fff",
          borderRadius: 14,
          width: 560,
          maxWidth: "92vw",
          boxShadow: "0 10px 30px rgba(0,0,0,.15)",
          padding: 18,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>
            {initial?.id ? "Edit customer" : "Add customer"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ marginLeft: "auto" }}
            className="btn btn-ghost"
          >
            ✕
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="fld">
            <span>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
            />
          </label>
          <label className="fld">
            <span>Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34…"
            />
          </label>
        </div>

        <label className="fld">
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="john@acme.com"
          />
        </label>

        <label className="fld">
          <span>Address (address_1)</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Calle, número, ciudad…"
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label className="fld">
            <span>Portal</span>
            <input
              value={portal}
              onChange={(e) => setPortal(e.target.value)}
              placeholder="Portal / piso / puerta"
            />
          </label>
          <label className="fld">
            <span>Observations</span>
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Notas internas…"
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="submit">
            {initial?.id ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
