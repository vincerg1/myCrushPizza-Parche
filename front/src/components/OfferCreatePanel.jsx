// src/components/OfferCreatePanel.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import api from "../setupAxios";

const SEGMENTS = ["S1", "S2", "S3", "S4"];
const WEEK_DAYS = ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"];

const TYPE_LABELS = {
  RANDOM_PERCENT: "Random (%)",
  FIXED_PERCENT : "% fijo",
  FIXED_AMOUNT  : "€ fijo",
};

const USAGE_LIMIT = 1; // cupones de un solo uso (fijo)

export default function OfferCreatePanel() {
  const [form, setForm] = useState({
    // tipo y valores
    type: "RANDOM_PERCENT",      // RANDOM_PERCENT | FIXED_PERCENT | FIXED_AMOUNT
    percentMin: 5,
    percentMax: 15,
    percent: 10,
    amount: 9.99,

    // cantidad/límites
    quantity: 10,
    maxAmount: "",               // tope € para cupones %
    segments: [],                // S1..S4
    assignedToId: "",            // opcional (customer.id)

    // vigencia
    activeFrom: "",              // datetime-local (opcional)
    expiresAt: "",               // datetime-local (OBLIGATORIO)

    // ventana temporal (opcional)
    isTemporal: false,
    daysActive: [],
    windowStart: "",
    windowEnd: "",

    // notas internas (no se envían aún)
    notes: "",
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [sample, setSample] = useState([]);

  // ───────────────── helpers
  const isRandom       = form.type === "RANDOM_PERCENT";
  const isFixedPercent = form.type === "FIXED_PERCENT";
  const isFixedAmount  = form.type === "FIXED_AMOUNT";

  const onChange = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const timeToMinutes = (hhmm) => {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
    const [h, m] = hhmm.split(":").map(Number);
    return (Number.isFinite(h) && Number.isFinite(m)) ? h * 60 + m : null;
  };

  // ───────────────── segmentos
  const allSegmentsSelected = useMemo(
    () => form.segments.length === SEGMENTS.length,
    [form.segments]
  );
  const toggleAllSegments = (checked) =>
    onChange("segments", checked ? [...SEGMENTS] : []);
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

  // ───────────────── buscador de clientes (Code/Nombre/Teléfono)
  const [custQuery, setCustQuery] = useState("");
  const [custOpts, setCustOpts]   = useState([]);
  const [loadingCust, setLoadingCust] = useState(false);
  const [showDrop, setShowDrop]   = useState(false);
  const debounceRef = useRef(null);
  const boxRef = useRef(null);

  // cerrar dropdown al click fuera
  useEffect(() => {
    const handler = (e) => {
      if (!boxRef.current?.contains(e.target)) setShowDrop(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // fetch clientes con debounce
  useEffect(() => {
    const q = custQuery.trim();
    if (q.length < 2) { setCustOpts([]); setShowDrop(false); return; }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setLoadingCust(true);
        // backend: /api/customers/admin soporta búsqueda por code/name/phone
        const { data } = await api.get("/api/customers/admin", { params: { q, take: 8 } });
        const items = Array.isArray(data?.items) ? data.items : [];
        setCustOpts(items);
        setShowDrop(true);
      } catch {
        setCustOpts([]);
        setShowDrop(false);
      } finally {
        setLoadingCust(false);
      }
    }, 250);

    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [custQuery]);

  const selectCustomer = (c) => {
    onChange("assignedToId", c.id);
    setCustQuery(`${c.code} · ${c.name || "-"} · ${c.phone || ""}`);
    setCustOpts([]);
    setShowDrop(false);
  };
  const clearCustomer = () => {
    onChange("assignedToId", "");
    setCustQuery("");
    setCustOpts([]);
    setShowDrop(false);
  };

  // ───────────────── validación
  const validate = () => {
    if (!Number.isFinite(Number(form.quantity)) || Number(form.quantity) < 1)
      return "Cantidad de cupones inválida.";

    if (!form.expiresAt)
      return "Debes indicar fecha/hora de caducidad.";

    if (isRandom) {
      const min = Number(form.percentMin);
      const max = Number(form.percentMax);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max > 90 || max < min)
        return "Rango de % inválido (1–90) y Min ≤ Max.";
    }
    if (isFixedPercent) {
      const p = Number(form.percent);
      if (!Number.isFinite(p) || p < 1 || p > 90)
        return "% fijo inválido (1–90).";
    }
    if (isFixedAmount) {
      const a = Number(form.amount);
      if (!Number.isFinite(a) || a <= 0)
        return "Importe fijo inválido (> 0).";
    }

    if ((isRandom || isFixedPercent) && String(form.maxAmount).trim() !== "") {
      const m = Number(form.maxAmount);
      if (!Number.isFinite(m) || m <= 0) return "Max Amount debe ser un número > 0.";
    }

    if (form.isTemporal) {
      if (!form.daysActive.length) return "Selecciona al menos un día de la semana.";
      const ws = timeToMinutes(form.windowStart);
      const we = timeToMinutes(form.windowEnd);
      if (ws == null || we == null) return "Completa hora inicio y fin (HH:MM).";
    }

    if (String(form.assignedToId).trim() !== "") {
      const cid = Number(form.assignedToId);
      if (!Number.isFinite(cid) || cid <= 0) return "ID de cliente inválido.";
    }

    return null;
  };

  // ───────────────── submit
  const submit = async (e) => {
    e.preventDefault();
    setMsg(""); setSample([]);
    const err = validate();
    if (err) { setMsg(err); return; }

    setSaving(true);
    try {
      const payload = {
        type: form.type,
        quantity: Number(form.quantity),
        usageLimit: USAGE_LIMIT, // 1 uso fijo

        ...(isRandom       ? { percentMin: Number(form.percentMin), percentMax: Number(form.percentMax) } : {}),
        ...(isFixedPercent ? { percent: Number(form.percent) } : {}),
        ...(isFixedAmount  ? { amount : Number(form.amount) } : {}),

        ...((isRandom || isFixedPercent) && String(form.maxAmount).trim() !== "" ? {
          maxAmount: Number(form.maxAmount)
        } : {}),

        ...(form.segments.length ? { segments: form.segments } : {}),
        ...(String(form.assignedToId).trim() !== "" ? { assignedToId: Number(form.assignedToId) } : {}),

        ...(form.activeFrom ? { activeFrom: form.activeFrom } : {}),
        ...(form.expiresAt  ? { expiresAt : form.expiresAt  } : {}),

        ...(form.isTemporal ? {
          daysActive: form.daysActive,
          windowStart: timeToMinutes(form.windowStart),
          windowEnd  : timeToMinutes(form.windowEnd),
        } : {}),
      };

      const { data } = await api.post(
        "/api/coupons/bulk-generate",
        payload,
        { headers: { "x-api-key": process.env.REACT_APP_SALES_API_KEY } }
      );

      setMsg(
        `✅ Se crearon ${data?.created ?? 0} cupones. ` +
        `Prefijo: ${data?.prefix || "-"}${
          data?.constraints?.expiresAt
            ? ` · Vence: ${new Date(data.constraints.expiresAt).toLocaleString("es-ES")}`
            : ""
        }`
      );
      setSample(Array.isArray(data?.sample) ? data.sample : []);

      // reset suave
      setForm((f) => ({
        ...f,
        quantity: 10,
        maxAmount: "",
        segments: [],
        assignedToId: "",
        activeFrom: "",
        expiresAt: "",           // forzar a reingresar vencimiento
        isTemporal: false,
        daysActive: [],
        windowStart: "",
        windowEnd: "",
        notes: "",
      }));
      clearCustomer();
    } catch (error) {
      setMsg(error?.response?.data?.error || "No se pudo generar cupones");
    } finally {
      setSaving(false);
    }
  };

  // ───────────────── UI
  return (
    <div className="panel-inner">
      <h2>Crear ofertas · Generar cupones</h2>

      <form onSubmit={submit} className="card" style={{ maxWidth: 860 }}>
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

        {/* Valores por tipo */}
        {isRandom && (
          <div className="row">
            <label>% Descuento (mín–máx)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                type="number" min="1" max="90"
                value={form.percentMin}
                onChange={(e) => onChange("percentMin", +e.target.value || 0)}
                placeholder="Mín"
              />
              <input
                className="input"
                type="number" min="1" max="90"
                value={form.percentMax}
                onChange={(e) => onChange("percentMax", +e.target.value || 0)}
                placeholder="Máx"
              />
            </div>
          </div>
        )}
        {isFixedPercent && (
          <div className="row">
            <label>% Descuento (fijo)</label>
            <input
              className="input"
              type="number" min="1" max="90"
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
              type="number" step="0.01" min="0.01"
              value={form.amount}
              onChange={(e) => onChange("amount", +e.target.value || 0)}
            />
          </div>
        )}

        {/* Tope para % */}
        {(isRandom || isFixedPercent) && (
          <div className="row">
            <label>Max Amount (€ · opcional, tope al descuento por %)</label>
            <input
              className="input"
              type="number" step="0.01" min="0"
              value={form.maxAmount}
              onChange={(e) => onChange("maxAmount", e.target.value)}
            />
          </div>
        )}

        {/* Cantidad */}
        <div className="row">
          <label>Cupones a generar</label>
          <input
            className="input"
            type="number" min="1"
            value={form.quantity}
            onChange={(e) => onChange("quantity", +e.target.value || 1)}
          />
          <p className="note">Cada cupón es de 1 solo uso.</p>
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

        {/* Asignación a cliente */}
        <div className="row">
          <label>Asignar a cliente (opcional)</label>
          <div ref={boxRef} style={{ position: "relative" }}>
            <input
              className="input"
              type="search"
              placeholder="Busca por CUS-, nombre o teléfono…"
              value={custQuery}
              onChange={(e) => setCustQuery(e.target.value)}
              onFocus={() => custOpts.length && setShowDrop(true)}
            />
            {form.assignedToId && (
              <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                <span className="badge">ID {form.assignedToId}</span>
                <button type="button" className="btn" onClick={clearCustomer}>Quitar</button>
              </div>
            )}

            {showDrop && (
              <div className="dropdown">
                {loadingCust && <div className="dropdown-item muted">Buscando…</div>}
                {!loadingCust && custOpts.length === 0 && (
                  <div className="dropdown-item muted">Sin resultados</div>
                )}
                {custOpts.map((c) => (
                  <div
                    key={c.id}
                    className="dropdown-item"
                    onMouseDown={() => selectCustomer(c)}
                  >
                    <b>{c.code}</b> — {c.name || "-"} · {c.phone || ""} ·{" "}
                    <span className="muted">{c.segment || ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
            <label>Vence</label>
            <input
              className="input"
              type="datetime-local"
              required
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
                Si fin &lt; inicio, la ventana cruza medianoche (p. ej., 22:00 → 03:00).
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
                percentMin: 5,
                percentMax: 15,
                percent: 10,
                amount: 9.99,
                quantity: 10,
                maxAmount: "",
                segments: [],
                assignedToId: "",
                activeFrom: "",
                expiresAt: "",
                isTemporal: false,
                daysActive: [],
                windowStart: "",
                windowEnd: "",
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

      {/* estilos mínimos para la caja y el dropdown */}
      <style>{`
        .card{
          background:#fff; border:1px solid #e9eaee; border-radius:16px;
          padding:18px 18px 16px; box-shadow:0 12px 28px rgba(16,24,40,.06);
        }
        .row{ display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
        .input, .card textarea{
          width:100%; padding:10px 12px; border:1px solid #dfe3e8; border-radius:10px;
          font-size:14px; outline:none;
        }
        .input:focus{ border-color:#b9c2ff; box-shadow:0 0 0 3px rgba(58,105,255,.15); }
        .actions{ display:flex; gap:10px; justify-content:flex-start; margin-top:8px; }
        .btn{ padding:8px 12px; border-radius:10px; border:1px solid #dfe3e8; background:#fff; cursor:pointer; }
        .btn.primary{ background:#ff2e73; border-color:#ff2e73; color:#fff; }
        .btn:disabled{ opacity:.6; cursor:not-allowed; }
        .note{ color:#666; font-size:12px; }
        .small{ font-size:13px; }
        .badge{ background:#eef2ff; color:#3949ab; padding:4px 8px; border-radius:999px; font-size:12px }
        .dropdown{
          position:absolute; left:0; right:0; top:100%;
          background:#fff; border:1px solid #e7e7ef; border-radius:10px;
          box-shadow:0 14px 36px rgba(16,24,40,.10); z-index:10;
          max-height:240px; overflow:auto; margin-top:6px;
        }
        .dropdown-item{ padding:10px 12px; cursor:pointer }
        .dropdown-item:hover{ background:#f7f8fb }
        .dropdown-item .muted{ color:#666 }
      `}</style>
    </div>
  );
}
