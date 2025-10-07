// src/components/OfferCreatePanel.jsx
import React, { useState } from "react";
import api from "../setupAxios";

export default function OfferCreatePanel() {
  const [form, setForm] = useState({
    code: "",
    kind: "PERCENT",   // PERCENT | FP (fijo) | CUSTOM
    percent: 10,
    value: 0,          // para FP
    expiresAt: "",
    usageLimit: 1,
    notes: ""
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const onChange = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg("");
    try {
      // ← ajusta al endpoint real cuando lo tengas
      const { data } = await api.post("/api/coupons", form);
      setMsg(`Cupón guardado: ${data?.code || form.code}`);
      setForm({
        code: "", kind: "PERCENT", percent: 10, value: 0,
        expiresAt: "", usageLimit: 1, notes: ""
      });
    } catch (err) {
      setMsg(err?.response?.data?.error || "No se pudo guardar el cupón");
    } finally {
      setSaving(false);
    }
  };

  const isFP = form.kind === "FP";

  return (
    <div className="panel-inner">
      <h2>Crear ofertas · Cupón</h2>

      <form onSubmit={submit} className="card" style={{maxWidth:680}}>
        <div className="row">
          <label>Código</label>
          <input
            className="input"
            value={form.code}
            onChange={e => onChange("code", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,""))}
            placeholder="MCP-FPXX-XXXX"
            required
          />
        </div>

        <div className="row">
          <label>Tipo</label>
          <select className="input" value={form.kind} onChange={e => onChange("kind", e.target.value)}>
            <option value="PERCENT">Descuento %</option>
            <option value="FP">Descuento fijo (FP)</option>
            <option value="CUSTOM">Personalizado</option>
          </select>
        </div>

        {form.kind === "PERCENT" && (
          <div className="row">
            <label>% Descuento</label>
            <input className="input" type="number" min="1" max="100"
              value={form.percent} onChange={e => onChange("percent", +e.target.value || 0)} />
          </div>
        )}

        {isFP && (
          <div className="row">
            <label>Importe fijo (€)</label>
            <input className="input" type="number" step="0.01" min="0"
              value={form.value} onChange={e => onChange("value", +e.target.value || 0)} />
          </div>
        )}

        <div className="row">
          <label>Vence (opcional)</label>
          <input className="input" type="datetime-local"
            value={form.expiresAt}
            onChange={e => onChange("expiresAt", e.target.value)}
          />
        </div>

        <div className="row">
          <label>Límite de usos</label>
          <input className="input" type="number" min="1"
            value={form.usageLimit}
            onChange={e => onChange("usageLimit", +e.target.value || 1)}
          />
        </div>

        <div className="row">
          <label>Notas / descripción</label>
          <textarea className="input" rows={3}
            value={form.notes}
            onChange={e => onChange("notes", e.target.value)}
            placeholder="Texto visible solo para admins (opcional)."
          />
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={() => setForm({
            code:"", kind:"PERCENT", percent:10, value:0, expiresAt:"", usageLimit:1, notes:""
          })}>
            Limpiar
          </button>
          <button className="btn primary" disabled={saving}>
            {saving ? "Guardando…" : "Guardar cupón"}
          </button>
        </div>

        {msg && <p className="note" style={{marginTop:8}}>{msg}</p>}
      </form>
    </div>
  );
}
