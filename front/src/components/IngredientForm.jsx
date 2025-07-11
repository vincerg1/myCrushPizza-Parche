// src/components/IngredientForm.jsx
import React, { useEffect, useState } from "react";
import api    from "../setupAxios";
import "../styles/IngredientForm.css";

export default function IngredientForm() {
  const [form, setForm] = useState({
    name: "", category: "", stock: "", unit: "", costPrice: "",
  });
  const [ingredients, setIngredients] = useState([]);

  /* fetch list on mount */
  useEffect(() => {
    api.get("/api/ingredients")
       .then(res => setIngredients(Array.isArray(res.data) ? res.data : []))
       .catch(console.error);
  }, []);

  /* handlers -------------------------------------------- */
  const onChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/ingredients", form);
      const res = await api.get("/api/ingredients");
      setIngredients(Array.isArray(res.data) ? res.data : []);
      setForm({ name:"", category:"", stock:"", unit:"", costPrice:"" });
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || "Error saving ingredient");
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this ingredient?")) return;
    try {
      await api.delete(`/api/ingredients/${id}`);
      setIngredients(prev => prev.filter(ing => ing.id !== id));
    } catch (err) {
      console.error(err);
      alert("Error deleting ingredient");
    }
  };

  /* ----------------------------------------------------- */
  return (
    <div className="ing-wrapper">
      <form className="ing-form" onSubmit={onSubmit}>
        <h2 className="ing-title">Add Ingredient</h2>

        <label className="ing-field">Name
          <input name="name" value={form.name} onChange={onChange} required />
        </label>

        <label className="ing-field">Category
          <input name="category" value={form.category} onChange={onChange} />
        </label>

        <label className="ing-field">Stock
          <input type="number" name="stock" value={form.stock} onChange={onChange} />
        </label>

        <label className="ing-field">Unit
          <input name="unit" value={form.unit} onChange={onChange} placeholder="g, ml, pcs…" />
        </label>

        <label className="ing-field">Cost price
          <input type="number" step="0.01"
                 name="costPrice" value={form.costPrice} onChange={onChange} />
        </label>

        <button className="ing-save">Add ingredient</button>
      </form>

      <table className="ing-table">
        <thead>
          <tr>
            <th>Name</th><th>Cat.</th><th>Stock</th><th>Unit</th><th>Cost</th><th>Delete</th>
          </tr>
        </thead>
        <tbody>
          {ingredients.map((ing) => (
            <tr key={ing.id}>
              <td>{ing.name}</td>
              <td>{ing.category}</td>
              <td>{ing.stock}</td>
              <td>{ing.unit}</td>
              <td>{ing.costPrice ?? "-"}</td>
              <td><button className="del-btn" onClick={() => onDelete(ing.id)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
