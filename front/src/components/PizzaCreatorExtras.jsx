import React, { useEffect, useState } from "react";

export default function PizzaCreatorExtras() {
  const [categories, setCategories] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [extras, setExtras] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState("");
  const [selectedCategories, setSelectedCategories] = useState([]);

  // cargar datos base
  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const [catRes, ingRes, extraRes] = await Promise.all([
      fetch("/api/categories").then(r => r.json()),
      fetch("/api/ingredients").then(r => r.json()),
      fetch("/api/ingredient-extras").then(r => r.json()),
    ]);

    setCategories(catRes);
    setIngredients(ingRes);
    setExtras(Array.isArray(extraRes) ? extraRes : []);
  };

  const openCreate = () => {
    setSelectedIngredient("");
    setSelectedCategories([]);
    setShowModal(true);
  };

  const openEdit = (extra) => {
    setSelectedIngredient(extra.ingredientId);
    setSelectedCategories(extra.categories.map(c => c.id));
    setShowModal(true);
  };

  const toggleCategory = (id) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const save = async () => {
    if (!selectedIngredient) return alert("Selecciona un ingrediente");

    await fetch("/api/ingredient-extras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ingredientId: selectedIngredient,
        categoryIds: selectedCategories,
      }),
    });

    setShowModal(false);
    loadAll();
  };

  const remove = async (ingredientId) => {
    if (!window.confirm("Eliminar este extra?")) return;

    await fetch(`/api/ingredient-extras/${ingredientId}`, {
      method: "DELETE",
    });

    loadAll();
  };

  return (
    <div>
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
                {e.categories.map(c => c.name).join(", ")}
              </div>
            </div>

            <div>
              <button onClick={() => openEdit(e)}>Editar</button>
              <button onClick={() => remove(e.ingredientId)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="extras-modal-backdrop">
          <div className="extras-modal">
            <h3>Extra</h3>

            <div className="field">
              <label>Ingrediente</label>
              <select
                value={selectedIngredient}
                onChange={(e) => setSelectedIngredient(Number(e.target.value))}
              >
                <option value="">— Selecciona —</option>
                {ingredients.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Categorías</label>
              <div className="checkbox-list">
                {categories.map(c => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(c.id)}
                      onChange={() => toggleCategory(c.id)}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={() => setShowModal(false)}>Cancelar</button>
              <button onClick={save}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
