import React, { useEffect, useState } from "react";

export default function MyOffersPanel() {
  const [loading, setLoading]   = useState(false);
  const [preview, setPreview]   = useState({ total: 0, sample: [] });
  const [errPreview, setErrPreview] = useState("");   // ← muestra error de preview
  const [errBulk, setErrBulk]       = useState("");   // ← muestra error de envío

  const [msg, setMsg] = useState(
    "📣 SOLO HOY\n" +
    "🍕 Pizzas para recoger en Plaza Diario a solo 8 € 😍\n" +
    "⚡ ¡Hay 20 unidades disponibles!\n" +
    "🔑 Palabra clave: promo8\n\n" +
    "Responde STOP para dejar de recibir."
  );
  const [testMode, setTestMode] = useState(true); // primero prueba con pocos
  const [limit, setLimit]       = useState(50);   // límite por tanda

  // helper: fetch que intenta parsear texto->JSON y soporta cookies
  const fetchJson = async (url, opts = {}) => {
    const res = await fetch(url, {
      credentials: "include",              // ← importante para prod (cookies/sesión)
      ...opts,
    });
    const txt = await res.text();          // intenta parsear aunque llegue HTML
    let data;
    try { data = JSON.parse(txt); }
    catch (e) {
      console.error(`[${url}] respuesta no-JSON:`, txt);
      throw new Error("Respuesta no válida (¿401/HTML/redirect?). Revalida sesión.");
    }
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `Error HTTP ${res.status}`);
    }
    return data;
  };

  // Carga previa de teléfonos válidos (cuenta + muestra)
  useEffect(() => {
    (async () => {
      try {
        setErrPreview("");
        const data = await fetchJson("/api/notify/customers/phones");
        setPreview({
          total: data?.total || 0,
          sample: (data?.phones || []).slice(0, 5),
        });
      } catch (e) {
        console.error("phones preview error", e);
        setErrPreview(e.message || "No se pudo cargar la vista previa.");
        setPreview({ total: 0, sample: [] });
      }
    })();
  }, []);

  const sendBulk = async () => {
    setErrBulk("");
    if (!msg?.trim()) { alert("Escribe un mensaje"); return; }
    if (!window.confirm(`Enviar SMS ${testMode ? "(MODO PRUEBA)" : ""} a clientes?`)) return;

    setLoading(true);
    try {
      const data = await fetchJson("/api/notify/bulk-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: msg,
          testOnly: testMode,           // si true, se envía a ids/números seleccionados en el backend
          limitPerBatch: Number(limit) || 50
        })
      });

      alert(`OK:
- total detectados: ${data.total}
- objetivo: ${data.target}
- enviados: ${data.sent}
- aceptados: ${data.accepted}
- fallidos: ${data.failed}`);

      if (data?.errors?.length) {
        console.warn("Errores de envío:", data.errors);
      }
    } catch (e) {
      console.error("bulk error", e);
      setErrBulk(e.message || "Error de envío");
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
          rows={6}
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
          &nbsp;Modo prueba (envía números seleccionados por backend)
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
          Muestra: {preview.sample.join(", ") || "—"}
        </small>
        {errPreview && (
          <div style={{ color: "#b00", marginTop: 4 }}>
            ⚠️ {errPreview}
          </div>
        )}
      </div>

      <button disabled={loading} onClick={sendBulk}>
        {loading ? "Enviando..." : `Enviar SMS ${testMode ? "(prueba)" : ""}`}
      </button>

      {errBulk && (
        <div style={{ color: "#b00", marginTop: 8 }}>
          ⚠️ {errBulk}
        </div>
      )}
    </div>
  );
}
