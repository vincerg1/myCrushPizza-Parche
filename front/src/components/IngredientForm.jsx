// src/components/IngredientForm.jsx
import React, { useEffect, useMemo, useState } from "react";
import api from "../setupAxios";
import "../styles/IngredientForm.css";

const CATEGORY_OPTIONS = [
  "SALSAS",
  "QUESOS",
  "OTROS LÁCTEOS",
  "FIAMBRES",
  "FRUTAS",
  "VEGETALES",
  "CARNES",
  "ESPECIAS",
  "OTROS",
];

const toUpperSafe = (v) => (v ?? "").toString().trim().toUpperCase();

export default function IngredientForm() {
  const [form, setForm] = useState({
    name: "",
    category: "",
    stock: "",
    unit: "",
    costPrice: "",
  });

  const [ingredients, setIngredients] = useState([]);
  const [openCat, setOpenCat] = useState(null);

  // EDIT MODAL
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    stock: "",
    unit: "",
    costPrice: "",
  });

  /* fetch list on mount */
  useEffect(() => {
    api
      .get("/api/ingredients")
      .then((res) => setIngredients(Array.isArray(res.data) ? res.data : []))
      .catch(console.error);
  }, []);

  /* derived: group by category */
  const grouped = useMemo(() => {
    const map = {};
    for (const c of CATEGORY_OPTIONS) map[c] = [];
    map.SIN_CATEGORÍA = [];

    for (const ing of ingredients) {
      const cat = toUpperSafe(ing.category);
      const key = cat && CATEGORY_OPTIONS.includes(cat) ? cat : "SIN_CATEGORÍA";
      map[key].push(ing);
    }

    for (const key of Object.keys(map)) {
      map[key].sort((a, b) =>
        toUpperSafe(a.name).localeCompare(toUpperSafe(b.name))
      );
    }

    return map;
  }, [ingredients]);

  /* handlers */
  const onChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...form,
      name: toUpperSafe(form.name),
      category: toUpperSafe(form.category),
      unit: (form.unit ?? "").toString().trim() || null,
      stock: form.stock === "" ? 0 : Number(form.stock),
      costPrice: form.costPrice === "" ? null : Number(form.costPrice),
    };

    try {
      await api.post("/api/ingredients", payload);
      const res = await api.get("/api/ingredients");
      setIngredients(Array.isArray(res.data) ? res.data : []);
      setForm({ name: "", category: "", stock: "", unit: "", costPrice: "" });
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Error saving ingredient");
    }
  };

  const onDelete = async (id, name = "") => {
    const label = name ? ` "${name}"` : "";
    if (!window.confirm(`Delete ingredient${label}? This can't be undone.`)) return;

    try {
      await api.delete(`/api/ingredients/${id}`);
      setIngredients((prev) => prev.filter((ing) => ing.id !== id));

      if (editOpen && editTarget?.id === id) {
        closeEditModal();
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting ingredient");
    }
  };

  const onToggleStatus = async (ing) => {
    const current = ing.status || "ACTIVE";
    const next = current === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    try {
      const res = await api.patch(`/api/ingredients/${ing.id}`, { status: next });
      const updated = res.data || { ...ing, status: next };

      setIngredients((prev) =>
        prev.map((x) => (x.id === ing.id ? { ...x, ...updated } : x))
      );
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Error updating status");
    }
  };

  // EDIT MODAL open/close
  const openEditModal = (ing) => {
    setEditTarget(ing);
    setEditForm({
      name: toUpperSafe(ing.name),
      category: toUpperSafe(ing.category),
      stock: ing.stock ?? 0,
      unit: ing.unit ?? "",
      costPrice: ing.costPrice ?? "",
    });
    setEditOpen(true);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setEditTarget(null);
    setEditForm({ name: "", category: "", stock: "", unit: "", costPrice: "" });
  };

  const onEditChange = (e) =>
    setEditForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const saveEdit = async () => {
    if (!editTarget?.id) return;

    const payload = {
      name: toUpperSafe(editForm.name),
      category: toUpperSafe(editForm.category),
      stock: editForm.stock === "" ? 0 : Number(editForm.stock),
      unit: (editForm.unit ?? "").toString().trim() || null,
      costPrice: editForm.costPrice === "" ? null : Number(editForm.costPrice),
    };

    try {
      const res = await api.patch(`/api/ingredients/${editTarget.id}`, payload);
      const updated = res.data || payload;

      setIngredients((prev) =>
        prev.map((x) => (x.id === editTarget.id ? { ...x, ...updated } : x))
      );

      closeEditModal();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Error updating ingredient");
    }
  };

  return (
    <div className="ing-wrapper">
      {/* FORM */}
      <form className="ing-form" onSubmit={onSubmit}>
        <h2 className="ing-title">Add Ingredient</h2>

        <label className="ing-field">
          Name
          <input
            name="name"
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                name: e.target.value.toUpperCase(),
              }))
            }
            required
          />
        </label>

        <label className="ing-field">
          Category
          <select name="category" value={form.category} onChange={onChange} required>
            <option value="">— SELECT —</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="ing-row2">
          <label className="ing-field">
            Stock
            <input type="number" name="stock" value={form.stock} onChange={onChange} min="0" />
          </label>

          <label className="ing-field">
            Unit
            <input name="unit" value={form.unit} onChange={onChange} placeholder="g, ml, pcs…" />
          </label>

          <label className="ing-field">
            Cost price
            <input
              type="number"
              step="0.01"
              name="costPrice"
              value={form.costPrice}
              onChange={onChange}
              min="0"
            />
          </label>
        </div>

        <button className="ing-save">Add ingredient</button>
      </form>

      {/* CATEGORIES PANEL */}
      <div className="ing-cats">
        {Object.entries(grouped)
          .filter(([_, list]) => list.length > 0)
          .map(([cat, list]) => (
            <div key={cat} className="ing-catCard">
              <button
                type="button"
                className="ing-catHead"
                onClick={() => setOpenCat((prev) => (prev === cat ? null : cat))}
              >
                <span className="ing-catName">{cat}</span>
                <span className="ing-catCount">{list.length}</span>
              </button>

              {openCat === cat && (
                <div className="ing-catListScroll">
                  <div className="ing-catList">
                    {list.map((ing) => {
                      const st = ing.status || "ACTIVE";
                      return (
                        <div key={ing.id} className="ing-itemRow">
                          <div className="ing-itemLeft">
                            <div className="ing-itemName">{ing.name}</div>
                          </div>

                          <div className="ing-itemActions">
                            <button
                              type="button"
                              className={`ing-statusBtn ${st === "ACTIVE" ? "is-on" : "is-off"}`}
                              onClick={() => onToggleStatus(ing)}
                              title="Click to toggle status"
                            >
                              {st}
                            </button>

                            <button
                              type="button"
                              className="ing-actionBtn"
                              onClick={() => openEditModal(ing)}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="ing-actionBtn danger"
                              onClick={() => onDelete(ing.id, ing.name)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>

      {/* EDIT MODAL */}
      {editOpen && (
        <div className="ing-modalOverlay" onMouseDown={closeEditModal}>
          <div className="ing-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ing-modalTop">
              <div>
                <div className="ing-modalName">Edit Ingredient</div>
                <div className="ing-modalSub">{editTarget?.name}</div>
              </div>
              <button type="button" className="ing-x" onClick={closeEditModal}>
                ✕
              </button>
            </div>

            <div className="ing-modalBody">
              <label className="ing-field">
                Name
                <input
                  name="name"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, name: e.target.value.toUpperCase() }))
                  }
                  required
                />
              </label>

              <label className="ing-field">
                Category
                <select name="category" value={editForm.category} onChange={onEditChange} required>
                  <option value="">— SELECT —</option>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <div className="ing-row2">
                <label className="ing-field">
                  Stock
                  <input type="number" name="stock" value={editForm.stock} onChange={onEditChange} min="0" />
                </label>

                <label className="ing-field">
                  Unit
                  <input name="unit" value={editForm.unit} onChange={onEditChange} placeholder="g, ml, pcs…" />
                </label>

                <label className="ing-field">
                  Cost price
                  <input
                    type="number"
                    step="0.01"
                    name="costPrice"
                    value={editForm.costPrice}
                    onChange={onEditChange}
                    min="0"
                  />
                </label>
              </div>
            </div>

            <div className="ing-modalActions">
              <button type="button" className="ing-actionBtn" onClick={closeEditModal}>
                Cancel
              </button>
              <button type="button" className="ing-actionBtn" onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
