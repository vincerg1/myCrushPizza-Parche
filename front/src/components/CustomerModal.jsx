import React, { useState } from "react";

export default function CustomerModal({ onSave, onClose, onDelete, initial = {} }) {
  const [form, setForm] = useState({
    name:         initial.name  ?? "",
    phone:        initial.phone ?? "",
    address:      initial.address?.toUpperCase() ?? "",
    observations: initial.observations ?? "",
    lat:          initial.lat ?? null,
    lng:          initial.lng ?? null,
  });
  const [err, setErr] = useState("");

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSave = () => {
    if (!form.name.trim() || !form.address.trim())
      return setErr("Name and address are required.");
    if (form.phone && !/^\d{9,15}$/.test(form.phone))
      return setErr("Phone must be 9-15 digits.");

    onSave({
      id          : initial.id, // <-- pasa el ID para actualizar si existe
      name        : form.name.trim(),
      phone       : form.phone.trim() || null,
      address_1   : form.address.trim(),
      observations: form.observations.trim(),
      lat         : form.lat,
      lng         : form.lng,
    });
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this customer?")) {
      onDelete(initial.id);
    }
  };

  return (
    <div className="custModal__backdrop">
      <div className="custModal__card">
        <h4>Customer details</h4>

        <label>Name *<input value={form.name} onChange={update("name")} /></label>

        <label>Phone<input value={form.phone} onChange={update("phone")} /></label>

        <label>
          Address *
          <input
            style={{ textTransform: "uppercase" }}
            value={form.address}
            onChange={(e) =>
              setForm((f) => ({ ...f, address: e.target.value.toUpperCase() }))
            }
          />
        </label>

        {form.lat && (
          <small>✔ geopoint {form.lat.toFixed(4)},{form.lng.toFixed(4)}</small>
        )}

        <label>
          Notes
          <textarea
            rows={2}
            value={form.observations}
            onChange={update("observations")}
          />
        </label>

        {err && <p className="err">{err}</p>}

        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          {initial.id && (
            <button className="danger" onClick={handleDelete}>
              Delete customer
            </button>
          )}
          
          <button className="primary" onClick={handleSave}>Save customer</button>
        </div>
      </div>

      {/* minimal CSS */}
      <style>{`
        .custModal__backdrop{
          position:fixed;inset:0;background:#0008;
          display:flex;align-items:center;justify-content:center;z-index:999;
        }
        .custModal__card{
          background:#fff;padding:20px;border-radius:8px;
          width:min(420px,90%);box-shadow:0 6px 18px #0003;
          display:flex;flex-direction:column;gap:10px;
        }
        .custModal__card input,
        .custModal__card textarea{
          width:100%;padding:6px;border:1px solid #bbb;border-radius:4px;
        }
        .actions{
          display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;
        }
        .err{color:red;margin:0}
        .primary{
          background:#ff6a00;color:#fff;border:none;
          padding:6px 14px;border-radius:4px
        }
        .danger{
          background:#e02424;color:#fff;border:none;
          padding:6px 14px;border-radius:4px
        }
      `}</style>
    </div>
  );
}
