// src/components/IncentivePanel.jsx
import React, { useEffect, useState } from "react";
import api from "../setupAxios";

export default function IncentivePanel() {

  const [incentives, setIncentives] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [pizzas, setPizzas] = useState([]);
  const [form, setForm] = useState({
    name: "",
    triggerMode: "FIXED",
    fixedAmount: "",
    percentOverAvg: "",
    rewardPizzaId: "",
    active: false,
    startsAt: "",
    endsAt: ""
  });

const load = async () => {
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

/* ───────────── Load pizzas ───────────── */

const loadPizzas = async () => {
  try {
    const { data } = await api.get("/api/pizzas");

    const active = Array.isArray(data)
      ? data.filter(p => p.status === "ACTIVE")
      : [];

    setPizzas(active);
  } catch {
    setPizzas([]);
  }
};

  useEffect(() => {
    load();
    loadPizzas();
  }, []);

  /* ───────────── Handlers ───────────── */

  const onChange = (k, v) =>
    setForm(f => ({ ...f, [k]: v }));

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "",
      triggerMode: "FIXED",
      fixedAmount: "",
      percentOverAvg: "",
      rewardPizzaId: "",
      active: false,
      startsAt: "",
      endsAt: ""
    });
  };

  const edit = (inc) => {
    setEditingId(inc.id);
    setForm({
      name: inc.name || "",
      triggerMode: inc.triggerMode,
      fixedAmount: inc.fixedAmount || "",
      percentOverAvg: inc.percentOverAvg || "",
      rewardPizzaId: inc.rewardPizzaId || "",
      active: inc.active || false,
      startsAt: inc.startsAt ? inc.startsAt.slice(0,16) : "",
      endsAt: inc.endsAt ? inc.endsAt.slice(0,16) : ""
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");

    if (!form.name) return setMsg("Nombre requerido.");
    if (!form.rewardPizzaId) return setMsg("Selecciona producto premio.");

    if (form.triggerMode === "FIXED" && !Number(form.fixedAmount))
      return setMsg("Monto fijo inválido.");

    if (form.triggerMode === "SMART_AVG_TICKET" && !Number(form.percentOverAvg))
      return setMsg("Percent over average inválido.");

    setSaving(true);

    try {
      const payload = {
        name: form.name,
        triggerMode: form.triggerMode,
        rewardPizzaId: Number(form.rewardPizzaId),
        active: form.active,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        ...(form.triggerMode === "FIXED" && {
          fixedAmount: Number(form.fixedAmount)
        }),
        ...(form.triggerMode === "SMART_AVG_TICKET" && {
          percentOverAvg: Number(form.percentOverAvg)
        })
      };

      if (editingId) {
        await api.patch(`/api/incentives/${editingId}`, payload);
        setMsg("Incentivo actualizado.");
      } else {
        await api.post("/api/incentives", payload);
        setMsg("Incentivo creado.");
      }

      resetForm();
      load();

    } catch {
      setMsg("Error guardando incentivo.");
    } finally {
      setSaving(false);
    }
  };

  const activate = async (id) => {
    await api.patch(`/api/incentives/${id}/activate`);
    load();
  };

  const activeIncentive = incentives.find(i => i.active);

  return (
    <div className="panel-inner">
      <h2>Incentivos</h2>

      {/* ───────────── Active incentive ───────────── */}
      {activeIncentive && (
        <div className="card" style={{ marginBottom: 20 }}>
          <strong>Incentivo activo:</strong>
          <div style={{ marginTop: 8 }}>
            <div><b>{activeIncentive.name}</b></div>
            <div>
              Trigger: {
                activeIncentive.triggerMode === "FIXED"
                  ? `€${activeIncentive.fixedAmount}`
                  : `${activeIncentive.percentOverAvg}% sobre ticket promedio`
              }
            </div>
            <div>Premio: {activeIncentive.rewardPizza?.name}</div>
          </div>
        </div>
      )}

      {/* ───────────── List ───────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Histórico</h3>

        {loading && <p className="note">Cargando…</p>}

        {!loading && incentives.map(i => (
          <div key={i.id}
            style={{
              display:"flex",
              justifyContent:"space-between",
              alignItems:"center",
              padding:"8px 0",
              borderBottom:"1px solid #eee"
            }}
          >
            <div>
              <div><b>{i.name}</b></div>
              <div className="note">
                {i.triggerMode === "FIXED"
                  ? `€${i.fixedAmount}`
                  : `${i.percentOverAvg}% sobre promedio`}
                {i.active && " · ACTIVO"}
              </div>
            </div>

            <div style={{ display:"flex", gap:8 }}>
              {!i.active && (
                <button className="btn" onClick={() => activate(i.id)}>
                  Activar
                </button>
              )}
              <button className="btn" onClick={() => edit(i)}>
                Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ───────────── Form ───────────── */}
      <form onSubmit={submit} className="card" style={{ maxWidth: 600 }}>

        <div className="row">
          <label>Nombre</label>
          <input className="input"
            value={form.name}
            onChange={e => onChange("name", e.target.value)}
          />
        </div>

        <div className="row">
          <label>Tipo de trigger</label>
          <select className="input"
            value={form.triggerMode}
            onChange={e => onChange("triggerMode", e.target.value)}
          >
            <option value="FIXED">Monto fijo</option>
            <option value="SMART_AVG_TICKET">% sobre ticket promedio</option>
          </select>
        </div>

        {form.triggerMode === "FIXED" && (
          <div className="row">
            <label>Monto mínimo (€)</label>
            <input className="input" type="number"
              value={form.fixedAmount}
              onChange={e => onChange("fixedAmount", e.target.value)}
            />
          </div>
        )}

        {form.triggerMode === "SMART_AVG_TICKET" && (
          <div className="row">
            <label>% sobre promedio</label>
            <input className="input" type="number"
              value={form.percentOverAvg}
              onChange={e => onChange("percentOverAvg", e.target.value)}
            />
          </div>
        )}

            <div className="row">
            <label>Pizza premio</label>
            <select
                className="input"
                value={form.rewardPizzaId}
                onChange={e => onChange("rewardPizzaId", e.target.value)}
            >
                <option value="">Selecciona una pizza…</option>
                {pizzas.map(p => (
                <option key={p.id} value={p.id}>
                    {p.id} · {p.name}
                </option>
                ))}
            </select>
            </div>

        <div className="row">
          <label>
            <input type="checkbox"
              checked={form.active}
              onChange={e => onChange("active", e.target.checked)}
            />
            Activar al guardar
          </label>
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={resetForm}>
            Cancelar
          </button>
          <button className="btn primary" disabled={saving}>
            {saving ? "Guardando…" : editingId ? "Actualizar" : "Crear"}
          </button>
        </div>

        {msg && <p className="note">{msg}</p>}
      </form>

      <style>{`
        .card{
          background:#fff; border:1px solid #e9eaee; border-radius:16px;
          padding:18px; box-shadow:0 12px 28px rgba(16,24,40,.06);
        }
        .row{ display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
        .input{
          width:100%; padding:10px 12px; border:1px solid #dfe3e8; border-radius:10px;
          font-size:14px; outline:none;
        }
        .actions{ display:flex; gap:10px; }
        .btn{ padding:8px 12px; border-radius:10px; border:1px solid #dfe3e8; background:#fff; cursor:pointer; }
        .btn.primary{ background:#ff2e73; border-color:#ff2e73; color:#fff; }
        .note{ font-size:12px; color:#666; }
      `}</style>
    </div>
  );
}