import React, { useEffect, useState } from "react";

// En prod (dominio mycrushpizza.com) usa el backend de Railway.
// En local deja vacío y funciona con el proxy a :8080.
const API_BASE =
  (typeof window !== "undefined" && window.location.hostname.includes("mycrushpizza.com"))
    ? "https://mycrushpizza-parche-production.up.railway.app"
    : "";

export default function MyOffersPanel() {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState({ total: 0, sample: [] });

  const [msg, setMsg] = useState(
    "📣 Escribe tu msj =)\n\n"
  );

  const [testMode, setTestMode] = useState(true); // primero prueba con pocos
  const [limit, setLimit] = useState(50);         // límite por tanda

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

  // Carga previa de teléfonos válidos (cuenta + muestra)
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
        setPreview({ total: 0, sample: [] }); // no crashea la UI
      }
    })();
  }, []);

  const sendBulk = async () => {
    if (!msg?.trim()) { alert("Escribe un mensaje"); return; }
    if (!window.confirm(`Enviar SMS ${testMode ? "(MODO PRUEBA)" : ""} a clientes?`)) return;

    setLoading(true);
    try {
      const data = await fetchJson("/api/notify/bulk-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: msg,
          testOnly: testMode,           // si true, envía solo a los seleccionados por backend
          limitPerBatch: Number(limit) || 50
        })
      });

      alert(`OK: enviados=${data.sent} aceptados=${data.accepted} fallidos=${data.failed}`);
    } catch (e) {
      console.error("bulk error", e);
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h2>Enviar promo por SMS</h2>

      <label className="block">
        Mensaje:
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          rows={5}
          style={{ width: "100%", marginTop: 8 }}
        />
      </label>

      <div style={{ margin: "8px 0" }}>
        <label>
          <input
            type="checkbox"
            checked={testMode}
            onChange={e => setTestMode(e.target.checked)}
          />
          &nbsp;Modo prueba (envía numero seleccionados)
        </label>
      </div>

      <div style={{ margin: "8px 0" }}>
        Límite por lote:&nbsp;
        <input
          type="number"
          value={limit}
          onChange={e => setLimit(e.target.value)}
          style={{ width: 80 }}
          min={10}
          max={500}
        />
      </div>

      <div style={{ margin: "12px 0" }}>
        <small>
          Clientes detectados: <b>{preview.total}</b><br/>
          Muestra: {preview.sample.join(", ")}
        </small>
      </div>

      <button disabled={loading} onClick={sendBulk}>
        {loading ? "Enviando..." : `Enviar SMS ${testMode ? "(prueba)" : ""}`}
      </button>
    </div>
  );
}
