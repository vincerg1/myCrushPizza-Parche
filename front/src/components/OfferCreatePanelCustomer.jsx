// src/components/OfferCreatePanelCustomer.jsx
import React, { useState } from "react";
import api from "../setupAxios";
console.log("🔥🔥🔥 OfferCreatePanelCustomer FILE LOADED");
const TYPE_LABELS = {
  RANDOM_PERCENT: "Random (%)",
  FIXED_PERCENT: "% fijo",
  FIXED_AMOUNT: "€ fijo",
};

export default function OfferCreatePanelCustomer({
  
  customer,
  onDone,
}) {
  
   console.log("🔥🔥🔥 OfferCreatePanelCustomer RENDER", customer);
  
  const [form, setForm] = useState({
    type: "RANDOM_PERCENT",
    percentMin: 5,
    percentMax: 15,
    percent: 10,
    amount: 5,
    maxAmount: "",
    expiresAt: "",
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const isRandom = form.type === "RANDOM_PERCENT";
  const isFixedPercent = form.type === "FIXED_PERCENT";
  const isFixedAmount = form.type === "FIXED_AMOUNT";

  const onChange = (k, v) =>
    setForm((f) => ({ ...f, [k]: v }));

  /* ───────────── Validation ───────────── */

  const validate = () => {
    if (!customer?.id) return "Cliente inválido.";
    if (!form.expiresAt) return "Debes indicar fecha/hora de caducidad.";

    if (isRandom) {
      const min = Number(form.percentMin);
      const max = Number(form.percentMax);
      if (min < 1 || max > 90 || max < min)
        return "Rango % inválido (1–90).";
    }

    if (isFixedPercent) {
      const p = Number(form.percent);
      if (p < 1 || p > 90)
        return "% fijo inválido (1–90).";
    }

    if (isFixedAmount) {
      const a = Number(form.amount);
      if (!Number.isFinite(a) || a <= 0)
        return "Importe fijo inválido.";
    }

    if ((isRandom || isFixedPercent) && form.maxAmount !== "") {
      const m = Number(form.maxAmount);
      if (!Number.isFinite(m) || m <= 0)
        return "Max Amount inválido.";
    }

    return null;
  };

  /* ───────────── Submit ───────────── */

const submit = async () => {
  setMsg("");

  const err = validate();
  if (err) {
    setMsg(err);
    return;
  }

  const payload = {
    type: form.type,
    ...(isRandom && {
      percentMin: Number(form.percentMin),
      percentMax: Number(form.percentMax),
    }),
    ...(isFixedPercent && {
      percent: Number(form.percent),
    }),
    ...(isFixedAmount && {
      amount: Number(form.amount),
    }),
    ...(form.maxAmount && {
      maxAmount: Number(form.maxAmount),
    }),
    expiresAt: form.expiresAt,
    notes: form.notes || null,
    customerId: customer.id,
  };

  console.log("🔥🔥 PUSH CUSTOMER PAYLOAD", payload);

  setSaving(true);
  try {
    await api.post(
      "/api/coupons/PushCustomer",
      payload,
      { headers: { "x-api-key": process.env.REACT_APP_SALES_API_KEY } }
    );

    setMsg("✅ Cupón creado y enviado al cliente.");
    setTimeout(() => onDone?.(), 900);
  } catch (e) {
    console.error(e);
    setMsg("No se pudo crear o enviar el cupón.");
  } finally {
    setSaving(false);
  }
};


  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 760 }}>
      <div className="row">
        <label>Tipo de cupón</label>
        <select
          className="input"
          value={form.type}
          onChange={(e) => onChange("type", e.target.value)}
        >
          <option value="RANDOM_PERCENT">{TYPE_LABELS.RANDOM_PERCENT}</option>
          <option value="FIXED_PERCENT">{TYPE_LABELS.FIXED_PERCENT}</option>
          <option value="FIXED_AMOUNT">{TYPE_LABELS.FIXED_AMOUNT}</option>
        </select>
      </div>

      {isRandom && (
        <div className="row">
          <label>% Descuento (mín–máx)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              type="number"
              min="1"
              max="90"
              value={form.percentMin}
              onChange={(e) => onChange("percentMin", +e.target.value || 0)}
            />
            <input
              className="input"
              type="number"
              min="1"
              max="90"
              value={form.percentMax}
              onChange={(e) => onChange("percentMax", +e.target.value || 0)}
            />
          </div>
        </div>
      )}

      {isFixedPercent && (
        <div className="row">
          <label>% Descuento fijo</label>
          <input
            className="input"
            type="number"
            min="1"
            max="90"
            value={form.percent}
            onChange={(e) => onChange("percent", +e.target.value || 0)}
          />
        </div>
      )}

      {isFixedAmount && (
        <div className="row">
          <label>Importe fijo (€)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0.01"
            value={form.amount}
            onChange={(e) => onChange("amount", +e.target.value || 0)}
          />
        </div>
      )}

      {(isRandom || isFixedPercent) && (
        <div className="row">
          <label>Max Amount (€ · opcional)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            value={form.maxAmount}
            onChange={(e) => onChange("maxAmount", e.target.value)}
          />
        </div>
      )}

      <div className="row">
        <label>Vence</label>
        <input
          className="input"
          type="datetime-local"
          required
          value={form.expiresAt}
          onChange={(e) => onChange("expiresAt", e.target.value)}
        />
      </div>

      <div className="row">
        <label>Nota interna (opcional)</label>
        <textarea
          className="input"
          rows={2}
          value={form.notes}
          onChange={(e) => onChange("notes", e.target.value)}
        />
      </div>

      <div className="actions">
        <button className="btn primary" disabled={saving}>
          {saving ? "Enviando…" : "Crear y enviar cupón"}
        </button>
      </div>

      {msg && <p className="note">{msg}</p>}
    </form>
  );
}
