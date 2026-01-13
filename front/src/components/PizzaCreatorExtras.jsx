import React, { useEffect, useState } from "react";
import "../styles/PizzaCreatorExtras.css";

export default function PizzaCreatorExtras() {
  const [categories, setCategories] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [extras, setExtras] = useState([]);

  const [modal, setModal] = useState(null); // null | "create" | "edit" | "delete"
  const [editingExtra, setEditingExtra] = useState(null);

  const [selectedIngredient, setSelectedIngredient] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]); 
const sortedIngredients = React.useMemo(() => {
  return [...ingredients].sort((a, b) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" })
  );
}, [ingredients]);



  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const [catRes, ingRes, extraRes] = await Promise.all([
      fetch("/api/categories").then(r => r.json()),
      fetch("/api/ingredients").then(r => r.json()),
      fetch("/api/ingredient-extras/all").then(r => r.json()),
    ]);

    setCategories(catRes);
    setIngredients(ingRes);
    setExtras(Array.isArray(extraRes) ? extraRes : []);
  };

  const openCreate = () => {
    setSelectedIngredient("");
    setSelectedCategories([]);
    setEditingExtra(null);
    setModal("create");
  };

  const openEdit = (extra) => {
    setSelectedIngredient(extra.ingredientId);
    setSelectedCategories(
      extra.categories.map(c => ({
        id: c.id,
        price: c.price || 0,
      }))
    );
    setEditingExtra(extra);
    setModal("edit");
  };

  const openDelete = (extra) => {
    setEditingExtra(extra);
    setModal("delete");
  };

  const toggleCategory = (id) => {
    setSelectedCategories(prev => {
      const exists = prev.find(c => c.id === id);
      if (exists) return prev.filter(c => c.id !== id);
      return [...prev, { id, price: 0 }];
    });
  };

  const setCategoryPrice = (id, price) => {
    setSelectedCategories(prev =>
      prev.map(c => (c.id === id ? { ...c, price } : c))
    );
  };

  const save = async () => {
    if (!selectedIngredient) return alert("Selecciona un ingrediente");

    await fetch("/api/ingredient-extras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredientId: selectedIngredient,
        links: selectedCategories.map(c => ({
          categoryId: c.id,
          price: Number(c.price),
        })),
      }),
    });

    setModal(null);
    loadAll();
  };

  const confirmDelete = async () => {
    await fetch(`/api/ingredient-extras/${editingExtra.ingredientId}`, {
      method: "DELETE",
    });
    setModal(null);
    loadAll();
  };

  return (
    <div className="extras-page">
      <div className="extras-header">
        <h2>Extras</h2>
        <button onClick={openCreate}>+ Añadir extra</button>
      </div>

      {/* LISTA */}
      <div>
        {extras.length === 0 && <p>No hay extras configurados.</p>}

        {extras.map((e) => (
          <div key={e.ingredientId} className="extra-row">
            <div>
              <strong>{e.ingredientName}</strong>
              <div className="extra-cats">
                {e.categories.map(c => `${c.name} (€${Number(c.price).toFixed(2)})`).join(", ")}
              </div>
            </div>

            <div>
              <button onClick={() => openEdit(e)}>Editar</button>
              <button onClick={() => openDelete(e)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      {/* CREATE / EDIT MODAL */}
      {(modal === "create" || modal === "edit") && (
        <div className="extras-modal-backdrop">
          <div className="extras-modal">
            <h3>{modal === "create" ? "Añadir extra" : "Editar extra"}</h3>

            <div className="field">
              <label>Ingrediente</label>
              <select
                value={selectedIngredient}
                onChange={(e) => setSelectedIngredient(Number(e.target.value))}
              >
                <option value="">— Selecciona —</option>
              {sortedIngredients.map(i => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
              </select>
            </div>

            <div className="field">
              <label>Categorías</label>
              <div className="checkbox-list">
                {categories.map(c => {
                  const selected = selectedCategories.find(x => x.id === c.id);

                  return (
              <div
                key={c.id}
                className={`extra-cat-row ${selected ? "is-active" : ""}`}
              >
                <div className="extra-cat-head">
                  <label className="extra-cat-left">
                    <input
                      type="checkbox"
                      checked={!!selected}
                      onChange={() => toggleCategory(c.id)}
                    />
                    <span className="extra-cat-name">{c.name}</span>
                  </label>

                  <div className="extra-cat-preview">
                    € {Number(selected?.price || 0).toFixed(2)}
                  </div>
                </div>

                <div className="extra-cat-editor">
                  <div className="extra-cat-input">
                    <span>€</span>
                    <input
                      type="number"
                      step="0.01"
                      value={selected?.price || ""}
                      placeholder="0.00"
                      onChange={(e) => setCategoryPrice(c.id, e.target.value)}
                    />
                  </div>
                </div>
              </div>
                  );
                })}
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={() => setModal(null)}>Cancelar</button>
              <button onClick={save}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {modal === "delete" && (
        <div className="extras-modal-backdrop">
          <div className="extras-modal">
            <h3>Eliminar</h3>
            <p>
              ¿Seguro que deseas eliminar{" "}
              <strong>{editingExtra?.ingredientName}</strong> como extra?
            </p>

            <div className="modal-actions">
              <button onClick={() => setModal(null)}>Cancelar</button>
              <button onClick={confirmDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
