// src/components/OfferCreatePanel.jsx
import React, { useMemo, useState, useEffect } from "react";
import api from "../setupAxios";

const SEGMENTS = ["S1", "S2", "S3", "S4"];
const WEEK_DAYS = ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"];

const TYPE_LABELS = {
  RANDOM_PERCENT: "Random (%)",
  FIXED_PERCENT : "% fijo",
  FIXED_AMOUNT  : "€ fijo",
};

const USAGE_LIMIT = 1;

export default function OfferCreatePanel() {

  const [form, setForm] = useState({
    type: "RANDOM_PERCENT",
    quantity: 10,
    percentMin: 5,
    percentMax: 15,
    percent: 10,
    amount: 9.99,
    maxAmount: "",
    segments: [],
    isTemporal: false,
    daysActive: [],
    windowStart: "",
    windowEnd: "",
    activeFrom: "",
    expiresAt: "",
    notes: "",
    useInGame: false,
    gameId: "",
    campaign: "",
    channel: "GAME",
    acquisition: "GAME",
    visibility: "PUBLIC", // 🔒 SIEMPRE PUBLIC EN DEFAULT
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [sample, setSample] = useState([]);

  /* ───────────── Games ───────────── */

  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState("");

  /* ───────────── Helpers ───────────── */

  const isRandom       = form.type === "RANDOM_PERCENT";
  const isFixedPercent = form.type === "FIXED_PERCENT";
  const isFixedAmount  = form.type === "FIXED_AMOUNT";

  const onChange = (k, v) =>
    setForm((f) => ({ ...f, [k]: v }));

  const timeToMinutes = (hhmm) => {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  /* ───────────── Segments ───────────── */

  const allSegmentsSelected = useMemo(
    () => form.segments.length === SEGMENTS.length,
    [form.segments]
  );

  const toggleAllSegments = (checked) =>
    onChange("segments", checked ? [...SEGMENTS] : []);

  const toggleSegment = (seg) => {
    setForm((f) => ({
      ...f,
      segments: f.segments.includes(seg)
        ? f.segments.filter((s) => s !== seg)
        : [...f.segments, seg],
    }));
  };

  const toggleDay = (day) => {
    setForm((f) => ({
      ...f,
      daysActive: f.daysActive.includes(day)
        ? f.daysActive.filter((d) => d !== day)
        : [...f.daysActive, day],
    }));
  };

  /* ───────────── Games loader ───────────── */

  useEffect(() => {
    if (!form.useInGame) return;

    let cancelled = false;

    const loadGames = async () => {
      setGamesLoading(true);
      setGamesError("");
      try {
        const { data } = await api.get("/api/games", {
          params: { active: true },
          headers: {
            "x-api-key": process.env.REACT_APP_SALES_API_KEY,
          },
        });

        if (!cancelled) {
          const items = Array.isArray(data?.items) ? data.items : [];
          setGames(items);

          if (!form.gameId && items.length) {
            setForm((f) => ({ ...f, gameId: String(items[0].id) }));
          }
        }
      } catch {
        if (!cancelled) setGamesError("No se pudieron cargar los juegos.");
      } finally {
        if (!cancelled) setGamesLoading(false);
      }
    };

    loadGames();
    return () => { cancelled = true; };
  }, [form.useInGame]);

  useEffect(() => {
    if (!form.useInGame) {
      setGames([]);
      setGamesLoading(false);
      setGamesError("");
      setForm((f) => ({
        ...f,
        gameId: "",
        campaign: "",
        channel: "GAME",
        acquisition: "GAME",
      }));
    }
  }, [form.useInGame]);

  /* ───────────── Validation ───────────── */

  const validate = () => {
    if (!Number.isFinite(Number(form.quantity)) || form.quantity < 1)
      return "Cantidad de cupones inválida.";

    if (!form.expiresAt)
      return "Debes indicar fecha/hora de caducidad.";

    if (isRandom) {
      const min = Number(form.percentMin);
      const max = Number(form.percentMax);
      if (min < 1 || max > 90 || max < min)
        return "Rango de % inválido (1–90).";
    }

    if (isFixedPercent) {
      const p = Number(form.percent);
      if (p < 1 || p > 90)
        return "% fijo inválido (1–90).";
    }

    if (isFixedAmount) {
      const a = Number(form.amount);
      if (a <= 0)
        return "Importe fijo inválido.";
    }

    if ((isRandom || isFixedPercent) && form.maxAmount !== "") {
      const m = Number(form.maxAmount);
      if (!Number.isFinite(m) || m <= 0)
        return "Max Amount inválido.";
    }

    if (form.isTemporal) {
      if (!form.daysActive.length)
        return "Selecciona días activos.";
      if (
        timeToMinutes(form.windowStart) == null ||
        timeToMinutes(form.windowEnd) == null
      )
        return "Horario inválido.";
    }

    if (form.useInGame) {
      const gid = Number(form.gameId);
      if (!Number.isFinite(gid) || gid <= 0)
        return "Debes seleccionar un juego.";
    }

    return null;
  };

  /* ───────────── Submit ───────────── */

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    setSample([]);

    const err = validate();
    if (err) return setMsg(err);

    setSaving(true);

    try {
      const payload = {
        type: form.type,
        quantity: Number(form.quantity),
        usageLimit: USAGE_LIMIT,
        visibility: "PUBLIC",

        ...(isRandom && {
          percentMin: Number(form.percentMin),
          percentMax: Number(form.percentMax),
        }),

        ...(isFixedPercent && { percent: Number(form.percent) }),
        ...(isFixedAmount && { amount: Number(form.amount) }),

        ...(form.maxAmount && { maxAmount: Number(form.maxAmount) }),
        ...(form.segments.length && { segments: form.segments }),
        ...(form.activeFrom && { activeFrom: form.activeFrom }),
        ...(form.expiresAt && { expiresAt: form.expiresAt }),

        ...(form.isTemporal && {
          daysActive: form.daysActive,
          windowStart: timeToMinutes(form.windowStart),
          windowEnd: timeToMinutes(form.windowEnd),
        }),

        ...(form.useInGame && {
          gameId: Number(form.gameId),
          campaign: form.campaign || undefined,
          channel: form.channel,
          acquisition: form.acquisition,
        }),
      };

      const { data } = await api.post(
        "/api/coupons/bulk-generate",
        payload,
        { headers: { "x-api-key": process.env.REACT_APP_SALES_API_KEY } }
      );

      setMsg(`✅ Se crearon ${data?.created ?? 0} cupones`);
      setSample(Array.isArray(data?.sample) ? data.sample : []);
    } catch {
      setMsg("No se pudo generar cupones.");
    } finally {
      setSaving(false);
    }
  };












  return (
    <div className="panel-inner">
      <h2>Crear ofertas · Generar cupones</h2>

      <form onSubmit={submit} className="card offer-scroll" style={{ maxWidth: 860 }}>
        <div className="row">
          <label>Tipo de cupón</label>
          <select className="input" value={form.type} onChange={(e) => onChange("type", e.target.value)}>
            <option value="RANDOM_PERCENT">{TYPE_LABELS.RANDOM_PERCENT}</option>
            <option value="FIXED_PERCENT">{TYPE_LABELS.FIXED_PERCENT}</option>
            <option value="FIXED_AMOUNT">{TYPE_LABELS.FIXED_AMOUNT}</option>
          </select>
        </div>

        {isRandom && (
          <div className="row">
            <label>% Descuento (mín–máx)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" type="number" min="1" max="90"
                value={form.percentMin} onChange={(e) => onChange("percentMin", +e.target.value || 0)} placeholder="Mín" />
              <input className="input" type="number" min="1" max="90"
                value={form.percentMax} onChange={(e) => onChange("percentMax", +e.target.value || 0)} placeholder="Máx" />
            </div>
          </div>
        )}
        {isFixedPercent && (
          <div className="row">
            <label>% Descuento (fijo)</label>
            <input className="input" type="number" min="1" max="90"
              value={form.percent} onChange={(e) => onChange("percent", +e.target.value || 0)} />
          </div>
        )}
        {isFixedAmount && (
          <div className="row">
            <label>Importe fijo (€)</label>
            <input className="input" type="number" step="0.01" min="0.01"
              value={form.amount} onChange={(e) => onChange("amount", +e.target.value || 0)} />
          </div>
        )}
        {(isRandom || isFixedPercent) && (
          <div className="row">
            <label>Max Amount (€ · opcional, tope al descuento por %)</label>
            <input className="input" type="number" step="0.01" min="0"
              value={form.maxAmount} onChange={(e) => onChange("maxAmount", e.target.value)} />
          </div>
        )}

        <div className="row">
          <label>Cupons a generar</label>
          <input className="input" type="number" min="1"
            value={form.quantity} onChange={(e) => onChange("quantity", +e.target.value || 1)} />
          <p className="note">Cada cupón es de 1 solo uso.</p>
        </div>

        <div className="row">
          <label>Segmentos aplicables</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="small">
              <input type="checkbox" checked={allSegmentsSelected} onChange={(e) => toggleAllSegments(e.target.checked)} /> Seleccionar todo
            </label>
            {SEGMENTS.map((s) => (
              <label key={s} className="small">
                <input type="checkbox" checked={form.segments.includes(s)} onChange={() => toggleSegment(s)} /> {s}
              </label>
            ))}
          </div>
        </div>
        
        <div className="row" style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="row">
</div>
            <label>Activo desde (opcional)</label>
            <input className="input" type="datetime-local"
              value={form.activeFrom} onChange={(e) => onChange("activeFrom", e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Vence</label>
            <input className="input" type="datetime-local" required
              value={form.expiresAt} onChange={(e) => onChange("expiresAt", e.target.value)} />
          </div>
        </div>

        <div className="row">
          <label className="small">
            <input type="checkbox" checked={form.isTemporal} onChange={(e) => onChange("isTemporal", e.target.checked)} /> Limitar por días/horas (temporal)
          </label>
          {form.isTemporal && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                {WEEK_DAYS.map((d) => (
                  <label key={d} className="small">
                    <input type="checkbox" checked={form.daysActive.includes(d)} onChange={() => toggleDay(d)} /> {d}
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <div>
                  <label>Hora inicio</label>
                  <input className="input" type="time" value={form.windowStart} onChange={(e) => onChange("windowStart", e.target.value)} />
                </div>
                <div>
                  <label>Hora fin</label>
                  <input className="input" type="time" value={form.windowEnd} onChange={(e) => onChange("windowEnd", e.target.value)} />
                </div>
              </div>
              <p className="note">Si fin &lt; inicio, la ventana cruza medianoche (p. ej., 22:00 → 03:00).</p>
            </>
          )}
        </div>

        <div className="row">
          <label>Notas / descripción (interno)</label>
          <textarea className="input" rows={3} value={form.notes}
            onChange={(e) => onChange("notes", e.target.value)}
            placeholder="Opcional — no se envía al endpoint por ahora." />
        </div>

        <div className="row">
          <label className="small">
            <input
              type="checkbox"
              checked={form.useInGame}
              onChange={(e) => onChange("useInGame", e.target.checked)}
            /> Usar este lote en un juego
          </label>

          {form.useInGame && (
            <>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label>Juego</label>
                  <select
                    className="input"
                    value={form.gameId}
                    onChange={(e) => onChange("gameId", e.target.value)}
                    disabled={gamesLoading}
                  >
                    <option value="">{gamesLoading ? "Cargando juegos..." : "Selecciona un juego…"}</option>
                    {games.map((g) => (
                      <option key={g.id} value={String(g.id)}>
                        {g.id} · {g.name}
                      </option>
                    ))}
                  </select>
                  {gamesError && <p className="note" style={{ color: "#b00020" }}>{gamesError}</p>}
                  {!gamesLoading && !gamesError && form.useInGame && games.length === 0 && (
                    <p className="note">No hay juegos activos.</p>
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <label>Campaña (opcional)</label>
                  <input
                    className="input"
                    type="text"
                    value={form.campaign}
                    onChange={(e) => onChange("campaign", e.target.value)}
                    placeholder="Ej. HALLOWEEN"
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label>Canal</label>
                  <select
                    className="input"
                    value={form.channel}
                    onChange={(e) => onChange("channel", e.target.value)}
                  >
                    <option value="GAME">GAME</option>
                    <option value="WEB">WEB</option>
                    <option value="CRM">CRM</option>
                    <option value="STORE">STORE</option>
                    <option value="APP">APP</option>
                    <option value="SMS">SMS</option>
                    <option value="EMAIL">EMAIL</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label>Origen (acquisition)</label>
                  <select
                    className="input"
                    value={form.acquisition}
                    onChange={(e) => onChange("acquisition", e.target.value)}
                  >
                    <option value="GAME">GAME</option>
                    <option value="CLAIM">CLAIM</option>
                    <option value="REWARD">REWARD</option>
                    <option value="BULK">BULK</option>
                    <option value="DIRECT">DIRECT</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={() => setForm({
            type:"RANDOM_PERCENT", quantity:10, percentMin:5, percentMax:15, percent:10, amount:9.99,
            maxAmount:"", segments:[], assignedTold:"", isTemporal:false, daysActive:[],
            windowStart:"", windowEnd:"", activeFrom:"", expiresAt:"", notes:"",
            useInGame:false, gameId:"", campaign:"", channel:"GAME", acquisition:"GAME"
          })}>Limpiar</button>
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

      <style>{`
        .card{
          background:#fff; border:1px solid #e9eaee; border-radius:16px;
          padding:18px 18px 16px; box-shadow:0 12px 28px rgba(16,24,40,.06);
        }
        .offer-scroll{
          max-height: calc(100vh - 200px);
          overflow-y: auto;
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
          position:absolute; left:0; right:0; top:100%; background:#fff; border:1px solid #e7e7ef; border-radius:10px;
          box-shadow:0 14px 36px rgba(16,24,40,.10); z-index:10; max-height:240px; overflow:auto; margin-top:6px;
        }
        .dropdown-item{ padding:10px 12px; cursor:pointer }
        .dropdown-item:hover{ background:#f7f8fb }
        .muted{ color:#666 }
      `}</style>
    </div>
  );
}
