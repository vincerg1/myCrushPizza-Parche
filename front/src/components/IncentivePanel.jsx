// src/components/IncentivePanel.jsx
import React, { useEffect, useState } from "react";
import api from "../setupAxios";
import "../styles/IncentivePanel.css";

export default function IncentivePanel() {
  const [incentives, setIncentives] = useState([]);
  const [pizzas, setPizzas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    name: "",
    triggerMode: "FIXED",
    fixedAmount: "",
    percentOverAvg: "",
    rewardPizzaId: "",
    active: false,
    startsAt: "",
    endsAt : "",
  });

  /* ───────────────────────── LOAD ───────────────────────── */

  const loadIncentives = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/incentives");
      setIncentives(Array.isArray(data) ? data : []);
    } catch {
      setIncentives([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPizzas = async () => {
    try {
      const { data } = await api.get("/api/pizzas");
      const active = Array.isArray(data) ? data.filter((p) => p.status === "ACTIVE") : [];
      setPizzas(active);
    } catch {
      setPizzas([]);
    }
  };

  useEffect(() => {
    loadIncentives();
    loadPizzas();
  }, []);

  /* ───────────────────────── FORM ───────────────────────── */

  const onChange = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const resetForm = () => {
    setEditingId(null);
    setMsg("");
    setForm({
      name: "",
      triggerMode: "FIXED",
      fixedAmount: "",
      percentOverAvg: "",
      rewardPizzaId: "",
      active: false,
      startsAt: "",
      endsAt: "",
    });
  };

  const openCreate = () => {
    resetForm();
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (inc) => {
    setMsg("");
    setEditingId(inc.id);
    setForm({
      name: inc.name || "",
      triggerMode: inc.triggerMode || "FIXED",
      fixedAmount: inc.fixedAmount ?? "",
      percentOverAvg: inc.percentOverAvg ?? "",
      rewardPizzaId: inc.rewardPizzaId ?? "",
      active: !!inc.active,
      startsAt: inc.startsAt ? inc.startsAt.slice(0, 16) : "",
      endsAt: inc.endsAt ? inc.endsAt.slice(0, 16) : "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    resetForm();
    setShowForm(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");

    if (!form.name?.trim()) return setMsg("Nombre requerido.");
    if (!form.rewardPizzaId) return setMsg("Selecciona producto premio.");

    if (form.triggerMode === "FIXED" && !Number(form.fixedAmount)) {
      return setMsg("Monto fijo inválido.");
    }

    if (form.triggerMode === "SMART_AVG_TICKET" && !Number(form.percentOverAvg)) {
      return setMsg("Percent over average inválido.");
    }

    setSaving(true);

    try {
      const payload = {
        name: form.name.trim(),
        triggerMode: form.triggerMode,
        rewardPizzaId: Number(form.rewardPizzaId),
        active: !!form.active,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        ...(form.triggerMode === "FIXED" && { fixedAmount: Number(form.fixedAmount) }),
        ...(form.triggerMode === "SMART_AVG_TICKET" && {
          percentOverAvg: Number(form.percentOverAvg),
        }),
      };

      if (editingId) {
        await api.patch(`/api/incentives/${editingId}`, payload);
        setMsg("Incentivo actualizado.");
      } else {
        await api.post("/api/incentives", payload);
        setMsg("Incentivo creado.");
      }

      await loadIncentives();
      // si quieres que se quede abierto tras guardar, comenta estas 2 líneas:
      resetForm();
      setShowForm(false);
    } catch {
      setMsg("Error guardando incentivo.");
    } finally {
      setSaving(false);
    }
  };

  /* ───────────────────────── ACTIONS ───────────────────────── */

  const activate = async (id) => {
    try {
      await api.patch(`/api/incentives/${id}/activate`);
      await loadIncentives();
    } catch {
      // opcional
    }
  };

  const remove = async (id) => {
    if (!window.confirm("¿Eliminar este incentivo?")) return;
    try {
      await api.delete(`/api/incentives/${id}`);
      await loadIncentives();
      if (editingId === id) closeForm();
    } catch {
      // opcional
    }
  };

  /* ───────────────────────── RENDER ───────────────────────── */

  return (
    <div className="IncentivePanel">
      {/* ───────── HEADER ───────── */}
      <div className="IncentivePanel-header">
        <h2>Incentives</h2>

        <button className="IncentivePanel-addBtn" onClick={openCreate}>
          + Add Incentive
        </button>
      </div>

      {/* ───────── KPI ROW (placeholder futuro) ───────── */}
      <div className="IncentivePanel-kpis">
        <div className="IncentivePanel-kpiCard">
          <span>Total Incentives</span>
          <strong>{incentives.length}</strong>
        </div>

        <div className="IncentivePanel-kpiCard">
          <span>Active</span>
          <strong>{incentives.filter((i) => i.active).length}</strong>
        </div>
      </div>

      {/* ───────── HISTÓRICO ───────── */}
      <div className="IncentivePanel-history">
        {loading && <div className="IncentivePanel-note">Loading...</div>}

        {!loading &&
          incentives.map((i) => (
            <div key={i.id} className="IncentivePanel-row">
              <div className="IncentivePanel-col">
                <div className="IncentivePanel-name">{i.name}</div>
                <div className="IncentivePanel-meta">
                  {i.triggerMode === "FIXED" ? `€${i.fixedAmount}` : `${i.percentOverAvg}% over avg`}
                </div>
              </div>

    
              <div className="IncentivePanel-actions">

                <button
                  className={`IncentivePanel-btn ${i.active ? "active" : ""}`}
                  onClick={() => !i.active && activate(i.id)}
                  disabled={i.active}
                >
                  {i.active ? "Active" : "Activate"}
                </button>

                <button
                  className="IncentivePanel-btn"
                  onClick={() => openEdit(i)}
                >
                  Edit
                </button>

                <button
                  className="IncentivePanel-btn danger"
                  onClick={() => remove(i.id)}
                >
                  Delete
                </button>

              </div>
            </div>
          ))}
      </div>

      {/* ───────── FORM ───────── */}
      {showForm && (
        <form onSubmit={submit} className="IncentivePanel-form">
          <h3>{editingId ? "Edit Incentive" : "Create Incentive"}</h3>

          <div className="IncentivePanel-field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => onChange("name", e.target.value)} />
          </div>

          <div className="IncentivePanel-field">
            <label>Trigger type</label>
            <select value={form.triggerMode} onChange={(e) => onChange("triggerMode", e.target.value)}>
              <option value="FIXED">Fixed amount</option>
              <option value="SMART_AVG_TICKET">% over average</option>
            </select>
          </div>

          {form.triggerMode === "FIXED" && (
            <div className="IncentivePanel-field">
              <label>Minimum amount (€)</label>
              <input
                type="number"
                value={form.fixedAmount}
                onChange={(e) => onChange("fixedAmount", e.target.value)}
              />
            </div>
          )}

          {form.triggerMode === "SMART_AVG_TICKET" && (
            <div className="IncentivePanel-field">
              <label>% over average</label>
              <input
                type="number"
                value={form.percentOverAvg}
                onChange={(e) => onChange("percentOverAvg", e.target.value)}
              />
            </div>
          )}

          <div className="IncentivePanel-field">
            <label>Reward pizza</label>
            <select value={form.rewardPizzaId} onChange={(e) => onChange("rewardPizzaId", e.target.value)}>
              <option value="">Select a pizza…</option>
              {pizzas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="IncentivePanel-checkbox">
            <label>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => onChange("active", e.target.checked)}
              />
              Activate on save
            </label>
          </div>

          <div className="IncentivePanel-formActions">
            <button type="button" onClick={closeForm}>
              Cancel
            </button>
            <button disabled={saving}>{saving ? "Saving..." : editingId ? "Update" : "Create"}</button>
          </div>

          {msg && <div className="IncentivePanel-note">{msg}</div>}
        </form>
      )}
    </div>
  );
}