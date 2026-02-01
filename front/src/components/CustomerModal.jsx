import React, { useEffect, useState } from "react";

export default function CustomerModal({
  onSave,
  onClose,
  onDelete,
  initial = {},
  variant = "delivery", // "delivery" | "pickup"
}) {
  const isPickup = variant === "pickup";

  const [form, setForm] = useState({
    name: initial.name ?? "",
    phone: initial.phone ?? "",
    address: (initial.address_1 || "").toUpperCase(),
    observations: initial.observations ?? "",
    lat: initial.lat ?? null,
    lng: initial.lng ?? null,
  });

  const [err, setErr] = useState("");

  useEffect(() => {
    setForm({
      name: initial.name ?? "",
      phone: initial.phone ?? "",
      address: (initial.address_1 || "").toUpperCase(),
      observations: initial.observations ?? "",
      lat: initial.lat ?? null,
      lng: initial.lng ?? null,
    });
    setErr("");
  }, [initial, variant]);

  const update = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const digits = (form.phone || "").replace(/\D/g, "");
  const phoneOk = digits.length >= 7 && digits.length <= 15;

  const handleSave = () => {
    if (!form.name.trim())
      return setErr("El nombre es obligatorio.");

    if (!phoneOk)
      return setErr("El teléfono debe tener 7–15 dígitos.");

    if (!isPickup && !form.address.trim())
      return setErr("La dirección es obligatoria para envío.");

    if (!isPickup && !form.observations.trim())
      return setErr("Indica piso, timbre o instrucciones para el repartidor.");

    const payload = {
      id: initial.id,
      name: form.name.trim(),
      phone: form.phone.trim(),
      observations: form.observations.trim() || null,
    };

    if (!isPickup) {
      payload.address_1 = form.address.trim();
      payload.lat = form.lat;
      payload.lng = form.lng;
    }

    onSave(payload);
  };

  const handleDelete = () => {
    if (initial.id && window.confirm("¿Eliminar este cliente?")) {
      onDelete?.(initial.id);
    }
  };

  return (
    <div className="custModal__backdrop">
      <div className="custModal__card">
        <h4>Datos del cliente</h4>

        <label>
          Nombre <span className="req">*</span>
        </label>
        <input
          value={form.name}
          onChange={update("name")}
          placeholder="Nombre del cliente"
        />

        <label>
          Teléfono <span className="req">*</span>
        </label>
        <input
          value={form.phone}
          onChange={update("phone")}
          inputMode="tel"
          placeholder="Incluye prefijo si hace falta"
        />

        {!isPickup && (
          <>
            <label>
              Dirección <span className="req">*</span>
            </label>
            <input
              style={{ textTransform: "uppercase" }}
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  address: e.target.value.toUpperCase(),
                }))
              }
              placeholder="Calle, número, portal…"
            />
          </>
        )}

        {form.lat && !isPickup && (
          <small>
            ✔ geopoint {form.lat.toFixed(4)},{form.lng?.toFixed(4)}
          </small>
        )}

        <label>
          Observaciones {!isPickup && <span className="req">*</span>}
        </label>
        <textarea
          rows={3}
          value={form.observations}
          onChange={update("observations")}
          placeholder={
            isPickup
              ? "Opcional"
              : "Piso, puerta, indicaciones para el repartidor"
          }
        />

        {err && <p className="err">{err}</p>}

        <div className="actions">
          <button onClick={onClose}>Cancelar</button>

          {initial.id && (
            <button className="danger" onClick={handleDelete}>
              Eliminar
            </button>
          )}

          <button className="primary" onClick={handleSave}>
            Guardar
          </button>
        </div>
      </div>

      {/* === ESTILOS === */}
      <style>{`
        :root{
          --brand:#4285f4;
          --accent:#f92672;
          --border:#e6e8ef;
          --text:#1f2937;
          --muted:#6b7280;
        }
        .custModal__backdrop{
          position:fixed; inset:0; background:#0008;
          display:flex; align-items:center; justify-content:center;
          z-index:999; padding:16px;
        }
        .custModal__card{
          background:#fff; color:var(--text);
          padding:20px 16px; border-radius:14px;
          width:min(520px,100%); max-height:85vh; overflow:auto;
          box-shadow:0 16px 40px rgba(0,0,0,.25);
        }
        .custModal__card h4{
          margin:0 0 10px; font-size:18px; font-weight:700;
        }
        .custModal__card label{
          display:block; margin:10px 2px 6px;
          font-size:14px; font-weight:600;
        }
        .req{ color:var(--accent); }

        input, textarea{
          width:100%; box-sizing:border-box;
          padding:12px 14px; font-size:16px;
          border:1.5px solid var(--border);
          border-radius:12px; outline:none;
        }
        textarea{ min-height:84px; resize:vertical; }

        input:focus, textarea:focus{
          border-color:var(--brand);
          box-shadow:0 0 0 3px rgba(66,133,244,.18);
        }

        .actions{
          display:flex; justify-content:flex-end;
          gap:8px; flex-wrap:wrap; margin-top:14px;
        }
        .err{ color:#e02424; margin-top:8px; font-weight:600; }
        .primary{
          background:var(--brand); color:#fff;
          border:none; padding:10px 16px;
          border-radius:10px; font-weight:700;
        }
        .danger{
          background:#e02424; color:#fff;
          border:none; padding:10px 14px;
          border-radius:10px; font-weight:700;
        }
        .actions > button{
          border:1px solid var(--border);
          background:#fff; padding:10px 14px;
          border-radius:10px;
        }
      `}</style>
    </div>
  );
}
