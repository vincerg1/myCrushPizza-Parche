import React, { useEffect, useState } from "react";

export default function MyOffersPanel() {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState({ total: 0, sample: [] });
const [msg, setMsg] = useState(
  "📣 SOLO HOY\n" +
  "🍕 Pizzas para recoger en Plaza Diario a solo 8 € 😍\n" +
  "⚡ ¡Hay 20 unidades disponibles!\n" +
  "🔑 Palabra clave: promo8\n\n" 
);
  const [testMode, setTestMode] = useState(true); // primero prueba con pocos
  const [limit, setLimit] = useState(50);         // límite por tanda

  // Carga previa de teléfonos válidos (cuenta + muestra)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/notify/customers/phones");
        const data = await res.json();
        setPreview({
          total: data?.total || 0,
          sample: (data?.phones || []).slice(0, 5),
        });
      } catch (e) {
        console.error("phones preview error", e);
      }
    })();
  }, []);

  const sendBulk = async () => {
    if (!msg?.trim()) { alert("Escribe un mensaje"); return; }
    if (!window.confirm(`Enviar SMS ${testMode ? "(MODO PRUEBA)" : ""} a clientes?`)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/notify/bulk-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: msg,
          testOnly: testMode,   // si true, envía solo a 3 números
          limitPerBatch: Number(limit) || 50
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error de envío");

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
          <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} />
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
