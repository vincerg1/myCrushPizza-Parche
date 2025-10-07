// src/components/OfferCreatePanel.jsx
import React, { useMemo, useState } from "react";
import api from "../setupAxios";

const SEGMENTS = ["S1", "S2", "S3", "S4"];
const WEEK_DAYS = ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"];

const TYPE_LABELS = {
  RANDOM_PERCENT: "Random (%)",
  FIXED_PERCENT: "% fijo",
  FIXED_AMOUNT: "€ fijo",
};

export default function OfferCreatePanel() {
  const [form, setForm] = useState({
    type: "RANDOM_PERCENT",   // RANDOM_PERCENT | FIXED_PERCENT | FIXED_AMOUNT
    quantity: 10,             // cupones asignados a generar
    // random:
    percentMin: 5,
    percentMax: 15,
    // fijo %:
    percent: 10,
    // fijo €:
    amount: 9.99,

    // límites/aplicación
    maxAmount: "",            // tope € para cupones % (opcional)
    usageLimit: 1,            // usos por cupón
    segments: [],             // S1..S4
    assignedToId: "",         // Customized: id de customer (opcional)

    // vigencia
    isTemporal: false,        // si true, usar días + ventana horaria
    daysActive: [],           // array de días (strings en ES; backend los normaliza)
    windowStart: "",          // "HH:MM"
    windowEnd: "",            // "HH:MM"

    // fechas absolutas (opcionales)
    activeFrom: "",           // datetime-local
    expiresAt: "",            // datetime-local

    notes: "",                // solo interno (no lo consume el endpoint, pero lo dejamos por si luego lo guardas)
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [sample, setSample] = useState([]);

  const isRandom = form.type === "RANDOM_PERCENT";
  const isFixedPercent = form.type === "FIXED_PERCENT";
  const isFixedAmount = form.type === "FIXED_AMOUNT";

  const timeToMinutes = (hhmm) => {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
    const [h, m] = hhmm.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
    // si start>end el backend ya interpreta que cruza medianoche
  };

  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const allSegmentsSelected = useMemo(
    () => form.segments.length === SEGMENTS.length,
    [form.segments]
  );

  const toggleAllSegments = (checked) => {
    onChange("segments", checked ? [...SEGMENTS] : []);
  };

  const toggleSegment = (seg) => {
    setForm((f) => {
      const has = f.segments.includes(seg);
      const next = has ? f.segments.filter((s) => s !== seg) : [...f.segments, seg];
      return { ...f, segments: next };
    });
  };

  const toggleDay = (day) => {
    setForm((f) => {
      const has = f.daysActive.includes(day);
      const next = has ? f.daysActive.filter((d) => d !== day) : [...f.daysActive, day];
      return { ...f, daysActive: next };
    });
  };

  const validate = () => {
    // básicos
    if (!Number.isFinite(Number(form.quantity)) || Number(form.quantity) < 1) {
      return "Cantidad de cupones inválida.";
    }
    if (!Number.isFinite(Number(form.usageLimit)) || Number(form.usageLimit) < 1) {
      return "Límite de usos debe ser al menos 1.";
    }

    // por tipo
    if (isRandom) {
      const min = Number(form.percentMin);
      const max = Number(form.percentMax);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max > 90 || max < min) {
        return "Rango de % inválido (1–90) y Min ≤ Max.";
      }
    }
    if (isFixedPercent) {
      const p = Number(form.percent);
      if (!Number.isFinite(p) || p < 1 || p > 90) {
        return "% fijo inválido (1–90).";
      }
    }
    if (isFixedAmount) {
      const a = Number(form.amount);
      if (!Number.isFinite(a) || a <= 0) {
        return "Importe fijo inválido (> 0).";
      }
    }

    // maxAmount solo aplica a % (opcional)
    if ((isRandom || isFixedPercent) && String(form.maxAmount).trim() !== "") {
      const m = Number(form.maxAmount);
      if (!Number.isFinite(m) || m <= 0) return "Max Amount debe ser un número > 0.";
    }

    // temporal: pedir días y horas
    if (form.isTemporal) {
      if (!form.daysActive.length) return "Selecciona al menos un día de la semana.";
      const ws = timeToMinutes(form.windowStart);
      const we = timeToMinutes(form.windowEnd);
      if (ws == null || we == null) return "Completa hora inicio y fin (HH:MM).";
    }

    // assignedToId opcional, pero si lo rellenan debe ser número
    if (String(form.assignedToId).trim() !== "") {
      const cid = Number(form.assignedToId);
      if (!Number.isFinite(cid) || cid <= 0) return "ID de cliente inválido.";
    }

    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    setSample([]);
    const err = validate();
    if (err) { setMsg(err); return; }

    setSaving(true);
    try {
      const payload = {
        type: form.type,                    // RANDOM_PERCENT | FIXED_PERCENT | FIXED_AMOUNT
        quantity: Number(form.quantity),
        usageLimit: Number(form.usageLimit),

        // valores por tipo
        ...(isRandom ? {
          percentMin: Number(form.percentMin),
          percentMax: Number(form.percentMax),
        } : {}),

        ...(isFixedPercent ? {
          percent: Number(form.percent),
        } : {}),

        ...(isFixedAmount ? {
          amount: Number(form.amount),
        } : {}),

        // tope € para % (opcional)
        ...((isRandom || isFixedPercent) && String(form.maxAmount).trim() !== "" ? {
          maxAmount: Number(form.maxAmount),
        } : {}),

        // segmentos
        ...(form.segments.length ? { segments: form.segments } : {}),

        // asignación a cliente
        ...(String(form.assignedToId).trim() !== "" ? { assignedToId: Number(form.assignedToId) } : {}),

        // fechas absolutas (opcionales)
        ...(form.activeFrom ? { activeFrom: form.activeFrom } : {}),
        ...(form.expiresAt  ? { expiresAt : form.expiresAt  } : {}),

        // ventana temporal (si activas el switch)
        ...(form.isTemporal ? {
          daysActive: form.daysActive,
          windowStart: timeToMinutes(form.windowStart),
          windowEnd:   timeToMinutes(form.windowEnd),
        } : {})
      };

      // IMPORTANTE: el endpoint requiere x-api-key (usa REACT_APP_SALES_API_KEY)
      const { data } = await api.post(
        "/api/coupons/bulk-generate",
        payload,
        { headers: { "x-api-key": process.env.REACT_APP_SALES_API_KEY } }
      );

      setMsg(`✅ Se crearon ${data?.created ?? 0} cupones. Prefijo: ${data?.prefix || "-"}${data?.constraints?.expiresAt ? ` · Vence: ${new Date(data.constraints.expiresAt).toLocaleString("es-ES")}` : ""}`);
      setSample(Array.isArray(data?.sample) ? data.sample : []);

      // reset suave manteniendo el tipo seleccionado
      setForm((f) => ({
        ...f,
        quantity: 10,
        usageLimit: 1,
        segments: [],
        assignedToId: "",
        maxAmount: "",
        activeFrom: "",
        expiresAt: "",
        isTemporal: false,
        daysActive: [],
        windowStart: "",
        windowEnd: "",
        notes: "",
      }));
    } catch (err) {
      setMsg(err?.response?.data?.error || "No se pudo generar cupones");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-inner">
      <h2>Crear ofertas · Generar cupones</h2>

      <form onSubmit={submit} className="card" style={{ maxWidth: 820 }}>
        {/* Tipo */}
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

        {/* Campos por tipo */}
        {isRandom && (
          <div className="row">
            <label>% Descuento (mín–máx)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" type="number" min="1" max="90"
                value={form.percentMin}
                onChange={(e) => onChange("percentMin", +e.target.value || 0)}
                placeholder="Mín" />
              <input className="input" type="number" min="1" max="90"
                value={form.percentMax}
                onChange={(e) => onChange("percentMax", +e.target.value || 0)}
                placeholder="Máx" />
            </div>
          </div>
        )}

        {isFixedPercent && (
          <div className="row">
            <label>% Descuento (fijo)</label>
            <input className="input" type="number" min="1" max="90"
              value={form.percent}
              onChange={(e) => onChange("percent", +e.target.value || 0)} />
          </div>
        )}

        {isFixedAmount && (
          <div className="row">
            <label>Importe fijo (€)</label>
            <input className="input" type="number" step="0.01" min="0.01"
              value={form.amount}
              onChange={(e) => onChange("amount", +e.target.value || 0)} />
          </div>
        )}

        {/* Tope para % */}
        {(isRandom || isFixedPercent) && (
          <div className="row">
            <label>Max Amount (€ · opcional, tope al descuento por %)</label>
            <input className="input" type="number" step="0.01" min="0"
              value={form.maxAmount}
              onChange={(e) => onChange("maxAmount", e.target.value)} />
          </div>
        )}

        {/* Cantidad + usos */}
        <div className="row" style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Cupones a generar</label>
            <input className="input" type="number" min="1"
              value={form.quantity}
              onChange={(e) => onChange("quantity", +e.target.value || 1)} />
          </div>
          <div style={{ width: 220 }}>
            <label>Límite de usos por cupón</label>
            <input className="input" type="number" min="1"
              value={form.usageLimit}
              onChange={(e) => onChange("usageLimit", +e.target.value || 1)} />
          </div>
        </div>

        {/* Segmentos */}
        <div className="row">
          <label>Segmentos aplicables</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="small">
              <input
                type="checkbox"
                checked={allSegmentsSelected}
                onChange={(e) => toggleAllSegments(e.target.checked)}
              />{" "}
              Seleccionar todo
            </label>
            {SEGMENTS.map((s) => (
              <label key={s} className="small">
                <input
                  type="checkbox"
                  checked={form.segments.includes(s)}
                  onChange={() => toggleSegment(s)}
                />{" "}
                {s}
              </label>
            ))}
          </div>
        </div>

        {/* Asignación a cliente (Customized) */}
        <div className="row">
          <label>Asignar a cliente (opcional · customer.id)</label>
          <input
            className="input"
            type="number"
            min="1"
            placeholder="Ej. 123"
            value={form.assignedToId}
            onChange={(e) => onChange("assignedToId", e.target.value)}
          />
          <p className="note">Si lo completas, el cupón solo será válido para ese cliente.</p>
        </div>

        {/* Fechas absolutas */}
        <div className="row" style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>Activo desde (opcional)</label>
            <input
              className="input"
              type="datetime-local"
              value={form.activeFrom}
              onChange={(e) => onChange("activeFrom", e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Vence (opcional)</label>
            <input
              className="input"
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => onChange("expiresAt", e.target.value)}
            />
          </div>
        </div>

        {/* Temporal: días + ventana */}
        <div className="row">
          <label className="small">
            <input
              type="checkbox"
              checked={form.isTemporal}
              onChange={(e) => onChange("isTemporal", e.target.checked)}
            />{" "}
            Limitar por días/horas (temporal)
          </label>

          {form.isTemporal && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                {WEEK_DAYS.map((d) => (
                  <label key={d} className="small">
                    <input
                      type="checkbox"
                      checked={form.daysActive.includes(d)}
                      onChange={() => toggleDay(d)}
                    />{" "}
                    {d}
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <div>
                  <label>Hora inicio</label>
                  <input
                    className="input"
                    type="time"
                    value={form.windowStart}
                    onChange={(e) => onChange("windowStart", e.target.value)}
                  />
                </div>
                <div>
                  <label>Hora fin</label>
                  <input
                    className="input"
                    type="time"
                    value={form.windowEnd}
                    onChange={(e) => onChange("windowEnd", e.target.value)}
                  />
                </div>
              </div>
              <p className="note">
                Si hora fin es menor que inicio, la ventana cruza medianoche (ej. 22:00 → 03:00).
              </p>
            </>
          )}
        </div>

        {/* Notas internas */}
        <div className="row">
          <label>Notas / descripción (interno)</label>
          <textarea
            className="input"
            rows={3}
            value={form.notes}
            onChange={(e) => onChange("notes", e.target.value)}
            placeholder="Opcional — no se envía al endpoint por ahora."
          />
        </div>

        {/* Acciones */}
        <div className="actions">
          <button
            className="btn"
            type="button"
            onClick={() =>
              setForm({
                type: "RANDOM_PERCENT",
                quantity: 10,
                percentMin: 5,
                percentMax: 15,
                percent: 10,
                amount: 9.99,
                maxAmount: "",
                usageLimit: 1,
                segments: [],
                assignedToId: "",
                isTemporal: false,
                daysActive: [],
                windowStart: "",
                windowEnd: "",
                activeFrom: "",
                expiresAt: "",
                notes: "",
              })
            }
          >
            Limpiar
          </button>
          <button className="btn primary" disabled={saving}>
            {saving ? "Generando…" : "Generar cupones"}
          </button>
        </div>

        {msg && <p className="note" style={{ marginTop: 8 }}>{msg}</p>}
        {!!sample.length && (
          <p className="note" style={{ marginTop: 4 }}>
            Ejemplos de códigos: {sample.join(", ")}
          </p>
        )}
      </form>
    </div>
  );
}

