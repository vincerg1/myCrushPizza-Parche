import React, { useEffect, useState } from "react";
import api from "../setupAxios";
import { useAuth } from "./AuthContext";
import "../styles/StoreInventory.css";

export default function StoreInventory() {
  const { auth } = useAuth();
  const storeId = auth?.storeId;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!storeId) return;
    setLoading(true);
    const { data } = await api.get(`/stores/${storeId}/ingredients`);
    setRows(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [storeId]);

  const patch = async (ingredientId, payload) => {
    setSaving(true);
    try {
      await api.patch(
        `/stores/${storeId}/ingredients/${ingredientId}`,
        payload
      );
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggle = (row) => {
    patch(row.id, { active: !row.active });
  };

  const setStock = (row, stock) => {
    patch(row.id, { stock });
  };

  if (!storeId) return null;

  if (loading) {
    return <div className="storeInv-loading">Loading inventory…</div>;
  }

  return (
    <div className="storeInv">
      <h2>Inventory – {auth.storeName}</h2>

      <table className="storeInv-table">
        <thead>
          <tr>
            <th>Ingredient</th>
            <th>Category</th>
            <th>Status</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={!r.active ? "inactive" : ""}>
              <td>{r.name}</td>
              <td>{r.category}</td>
              <td>
                <button
                  className={`storeInv-toggle ${r.active ? "on" : "off"}`}
                  onClick={() => toggle(r)}
                  disabled={saving}
                >
                  {r.active ? "ACTIVE" : "INACTIVE"}
                </button>
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  value={r.stock}
                  disabled={!r.active || saving}
                  onChange={(e) => setStock(r, Number(e.target.value))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {saving && <div className="storeInv-saving">Saving…</div>}
    </div>
  );
}
