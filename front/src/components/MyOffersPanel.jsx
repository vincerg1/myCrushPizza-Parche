import React, { useEffect, useState } from "react";
import "../styles/MyOffersPanel.css";
// En prod (dominio mycrushpizza.com) usa el backend de Railway.
// En local deja vacío y funciona con el proxy a :8080.
const API_BASE =
  (typeof window !== "undefined" && window.location.hostname.includes("mycrushpizza.com"))
    ? "https://mycrushpizza-parche-production.up.railway.app"
    : "";

const SEGMENTS = ["S1","S2","S3","S4"];

export default function MyOffersPanel() {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState({ total: 0, sample: [] });

  const [msg, setMsg] = useState("📣 Escribe tu msj =)\n\n");

  // envío
  const [mode, setMode] = useState("all");        // all | segment | single
  const [selSegs, setSelSegs] = useState([]);     // para mode=segment
  const [phones, setPhones] = useState("");       // para mode=single (separados por coma/espacios)

  // controles
  const [testMode, setTestMode] = useState(true); // primero prueba con pocos
  const [testLimit, setTestLimit] = useState(50); // cuántos en modo prueba
  const [batchSize, setBatchSize] = useState(100);// tamaño del lote (batch)

  // helper: fetch que soporta cookies y parsea texto->JSON con fallback
  const fetchJson = async (path, opts = {}) => {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, { credentials: "include", ...opts });
    const txt = await res.text();
    try {
      const data = JSON.parse(txt);
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `Error HTTP ${res.status}`);
      }
      return data;
    } catch {
      console.error(`[${url}] respuesta no-JSON:`, txt);
      throw new Error("Respuesta no válida (¿401/HTML/redirect?). Revalida sesión.");
    }
  };

  // Carga previa (cuenta + muestra global)
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJson("/api/notify/customers/phones");
        setPreview({
          total: data?.total || 0,
          sample: (data?.phones || []).slice(0, 5),
        });
      } catch (e) {
        console.error("phones preview error", e);
        setPreview({ total: 0, sample: [] });
      }
    })();
  }, []);

  const toggleSeg = (s) => {
    setSelSegs((prev) => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const validate = () => {
    if (!msg?.trim()) return "Escribe el mensaje.";
    if (mode === "segment" && selSegs.length === 0) return "Selecciona al menos un segmento.";
    if (mode === "single") {
      const list = (phones || "").split(/[,\s;]+/).map(x => x.trim()).filter(Boolean);
      if (list.length === 0) return "Ingresa al menos un teléfono para envío individual.";
    }
 
    if (!Number.isFinite(Number(batchSize)) || Number(batchSize) < 10) {
      return "Batch size mínimo 10.";
    }
    return null;
  };

  const sendBulk = async () => {
    const err = validate();
    if (err) { alert(err); return; }
    if (!window.confirm(`Enviar SMS ${testMode ? "(MODO PRUEBA)" : ""} — modo: ${mode}?`)) return;

    setLoading(true);
    try {
      const payload = {
        body: msg,
        mode,
        testOnly: testMode,
        ...(testMode ? { testLimit: Number(testLimit) || 50 } : {}),
        batchSize: Number(batchSize) || 100,
        ...(mode === "segment" ? { segments: selSegs } : {}),
        ...(mode === "single"  ? { phones } : {}),
      };

      const data = await fetchJson("/api/notify/bulk-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      alert(`OK:
- candidatos: ${data.totalCandidates}
- objetivo:   ${data.target}
- enviados:   ${data.sent}
- aceptados:  ${data.accepted}
- fallidos:   ${data.failed}
${data.sample?.length ? `muestra: ${data.sample.join(", ")}` : ""}`);
    } catch (e) {
      console.error("bulk error", e);
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

return (
  <div className="my-offers-panel">
    <h2>Enviar promo por SMS</h2>

    {/* Mensaje */}
    <label className="block">
      Mensaje:
      <textarea
        value={msg}
        onChange={e => setMsg(e.target.value)}
        rows={6}
        placeholder="Escribe el texto que recibirán tus clientes…"
      />
    </label>

    {/* Modo de audiencia */}
    <div className="audience-box">
      <b>Audiencia</b>
      <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
        <label>
          <input
            type="radio"
            name="aud"
            checked={mode === "all"}
            onChange={() => setMode("all")}
          />{" "}
          Todos
        </label>

        <label>
          <input
            type="radio"
            name="aud"
            checked={mode === "segment"}
            onChange={() => setMode("segment")}
          />{" "}
          Por segmento
        </label>

        <label>
          <input
            type="radio"
            name="aud"
            checked={mode === "single"}
            onChange={() => setMode("single")}
          />{" "}
          Individual
        </label>
      </div>
    </div>

    {/* Segmentos */}
    {mode === "segment" && (
      <div style={{ margin: "8px 0" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {SEGMENTS.map(s => (
            <label key={s} className="segment-pill">
              <input
                type="checkbox"
                checked={selSegs.includes(s)}
                onChange={() => toggleSeg(s)}
              />
              {s}
            </label>
          ))}
        </div>
        <small className="muted">
          Se enviará solo a clientes de los segmentos seleccionados (excluye restringidos).
        </small>
      </div>
    )}

    {/* Teléfonos individuales */}
    {mode === "single" && (
      <div style={{ margin: "8px 0" }}>
        <label className="block">
          Teléfonos (separados por coma, espacio o salto de línea):
          <textarea
            rows={3}
            value={phones}
            onChange={e => setPhones(e.target.value)}
            placeholder="Ej: 603172193, 612345678  +34600111222"
          />
        </label>
        <small className="muted">El backend deduplica y normaliza a E.164.</small>
      </div>
    )}

    {/* Controles de envío */}
    <div className="controls-grid">
      <label className="block">
        <span>
          <input
            type="checkbox"
            checked={testMode}
            onChange={e => setTestMode(e.target.checked)}
          />{" "}
          Modo prueba
        </span>
      </label>

      <label className="block">
        Batch size:
        <input
          type="number"
          value={batchSize}
          onChange={e => setBatchSize(e.target.value)}
          min={10}
          max={500}
        />
      </label>
    </div>

    {/* Preview global */}
    <div style={{ margin: "8px 0 14px" }}>
      <small className="muted">
        Clientes con teléfono: <b>{preview.total}</b>
        <br />
        Muestra: {preview.sample.join(", ")}
      </small>
    </div>

    <button disabled={loading} onClick={sendBulk}>
      {loading ? "Enviando..." : `Enviar SMS ${testMode ? "(prueba)" : ""}`}
    </button>
  </div>
);

}
