// ─────────────────────────────────────────────────────────────
// src/components/PizzaCreator.jsx
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import api from "../setupAxios";
import "../styles/PizzaCreator.css";
import {
  DndContext,
  closestCenter,
} from "@dnd-kit/core";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";



/* ---------------------- constantes ---------------------- */
const sizeList = ["S", "M", "L", "XL", "XXL", "ST"];

const categoryOptions = [
  "Pizza Básica",
  "Pizza Frita",
  "Pizza Especial",
  "Pizza Dulce",
  "Bebidas",
  "Complementos",
  "Postres",
];

/* ---------------------- Modal simple ---------------------- */
function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return ReactDOM.createPortal(
    <div
      className="pc-modal"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 999,
        padding: 16,
      }}
    >
      <div
        className="pc-modal__panel"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(980px, 100%)",
          maxHeight: "85vh",
          overflow: "hidden",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e7e7e7",
        }}
      >
        <div
          className="pc-modal__head"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 12,
            borderBottom: "1px solid #eee",
          }}
        >
          <div style={{ fontWeight: 900 }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid #e7e7e7",
              background: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        <div
          className="pc-modal__body"
          style={{
            padding: 12,
            overflow: "auto",
            maxHeight: "calc(85vh - 60px)",
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ======================================================== */
export default function PizzaCreator() {
  const [pizzaOrderByCat, setPizzaOrderByCat] = useState({});
  function SortablePizza({ id, children, dragHandleProps }) {
  const {
    setNodeRef,
    transform,
    transition,
    attributes,
    listeners,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(listeners)}
    </div>
  );
}
  /* ---------- form state ---------- */
  const [form, setForm] = useState({
    name: "",
    category: "",
    sizes: [],
    priceBySize: { S: "", M: "", L: "", XL: "", XXL: "", ST: "" },
    imageFile: null,
    ingredients: [],
  });

  /* ---------- inventory ---------- */
  const [inventory, setInventory] = useState([]);
  useEffect(() => {
    let alive = true;
    api
      .get("/api/ingredients")
      .then((r) => {
        if (!alive) return;
        setInventory(Array.isArray(r.data) ? r.data : []);
      })
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- pizzas ---------- */
  const [pizzas, setPizzas] = useState([]);
  const fetchPizzas = useCallback(async () => {
    try {
      const r = await api.get("/api/pizzas");
      setPizzas(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchPizzas();
  }, [fetchPizzas]);

  /* ---------- Category cards + modal ---------- */
  const [openCat, setOpenCat] = useState(null);
  const [editingPizzaId, setEditingPizzaId] = useState(null);
  const [existingImage, setExistingImage] = useState(null);

  const loadPizzaForEdit = (pizza) => {
  setEditingPizzaId(pizza.id);
  setExistingImage(pizza.image || null);

  setForm({
    name: pizza.name || "",
    category: pizza.category || "",
    sizes: pizza.selectSize || [],
    priceBySize: pizza.priceBySize || { S:"", M:"", L:"", XL:"", XXL:"", ST:"" },
    imageFile: null, // solo si eligen nueva
    ingredients: (pizza.ingredients || []).map((i) => ({
      id: i.id,
      name: i.name,
      qtyBySize: i.qtyBySize || {},
    })),
  });

  setOpenCat(null);
  window.scrollTo({ top: 0, behavior: "smooth" });
};

  const pizzasByCategory = useMemo(() => {
    const map = Object.fromEntries(categoryOptions.map((c) => [c, []]));
    for (const p of pizzas) {
      const c = p?.category || "";
      if (!map[c]) map[c] = [];
      map[c].push(p);
    }
    for (const c of Object.keys(map)) {
      map[c] = (map[c] || [])
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    }
    return map;
  }, [pizzas]);

  useEffect(() => {
  if (!openCat) return;

  setPizzaOrderByCat((prev) => {
    if (prev[openCat]) return prev;

    return {
      ...prev,
      [openCat]: (pizzasByCategory[openCat] || []).map((p) => p.id),
    };
  });
}, [openCat, pizzasByCategory]);

  /* ---------- handlers (form) ---------- */
  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    const onSizeToggle = (e) => {
      const { value, checked } = e.target;

      setForm((p) => {
        const nextSizes = checked
          ? [...p.sizes, value]
          : p.sizes.filter((s) => s !== value);

        // 🔥 CLAVE: limpiar precio si se desmarca
        const nextPriceBySize = { ...p.priceBySize };
        if (!checked) {
          nextPriceBySize[value] = "";
        }

        const nextIngredients = p.ingredients.map((row) => {
          const qtyBySize = { ...(row.qtyBySize || {}) };
          if (!checked) delete qtyBySize[value];
          return { ...row, qtyBySize };
        });

        return {
          ...p,
          sizes: nextSizes,
          priceBySize: nextPriceBySize,
          ingredients: nextIngredients,
        };
      });
    };

  const onPriceChange = (e, sz) =>
    setForm((p) => ({
      ...p,
      priceBySize: { ...p.priceBySize, [sz]: e.target.value },
  }));

  const onImageSelect = (e) => setForm((p) => ({ ...p, imageFile: e.target.files?.[0] || null }));

  /* ---------- ingredientes (arma tu pizza) ---------- */
  const addIngredient = () => {
    const qty = {};
    sizeList.forEach((s) => (qty[s] = 0));
    setForm((p) => ({
      ...p,
      ingredients: [...p.ingredients, { id: "", name: "", qtyBySize: qty }],
    }));
  };
  const removeIngredient = (i) =>
    setForm((p) => ({
      ...p,
      ingredients: p.ingredients.filter((_, idx) => idx !== i),
  }));
  const onIngredientSelect = (i, id) => {
    const row = inventory.find((r) => r.id === Number(id));
    if (!row) return;

    setForm((p) => {
      const ing = [...p.ingredients];
      ing[i] = { ...ing[i], id: row.id, name: row.name };
      return { ...p, ingredients: ing };
    });
  };
  const onQtyChange = (i, sz, val) =>
    setForm((p) => {
      const ing = [...p.ingredients];
      ing[i] = { ...ing[i], qtyBySize: { ...(ing[i].qtyBySize || {}), [sz]: val } };
      return { ...p, ingredients: ing };
  });

  /* ---------- submit ---------- */
  const onSubmit = async (e) => {
    e.preventDefault();

    const fd = new FormData();
    fd.append("name", form.name.trim());
    fd.append("category", form.category);
    fd.append("sizes", JSON.stringify(form.sizes));
    fd.append("priceBySize", JSON.stringify(form.priceBySize));
    fd.append("ingredients", JSON.stringify(form.ingredients));
    if (form.imageFile) fd.append("image", form.imageFile);

    try {
      if (editingPizzaId) {
        // 🔁 EDITAR
        await api.put(`/api/pizzas/${editingPizzaId}`, fd);
        alert("Producto actualizado");
      } else {
        // ➕ CREAR
        await api.post("/api/pizzas", fd);
        alert("Producto creado");
      }

      // 🧹 reset estado
      setEditingPizzaId(null);
      setExistingImage(null);
      setForm({
        name: "",
        category: "",
        sizes: [],
        priceBySize: { S: "", M: "", L: "", XL: "", XXL: "", ST: "" },
        imageFile: null,
        ingredients: [],
      });

      fetchPizzas();
    } catch (err) {
      console.error(err);
      alert("Error al guardar");
    }
  };

  const deletePizza = async (id) => {
    if (!window.confirm("¿Eliminar producto?")) return;
    try {
      await api.delete(`/api/pizzas/${id}`);
      setPizzas((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      console.error(e);
      alert("No se pudo eliminar");
    }
  };
  const onPizzaDragEnd = (event) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  setPizzaOrderByCat((prev) => {
    const list = prev[openCat] || [];
    const oldIndex = list.indexOf(active.id);
    const newIndex = list.indexOf(over.id);

    return {
      ...prev,
      [openCat]: arrayMove(list, oldIndex, newIndex),
    };
  });
};

  const selectedSizes = form.sizes;

  /* ====================================================== */
  return (
    <>
      <div className="pc-layout">
      <h2 className="pc-title">
      {editingPizzaId ? "Editando producto" : "Crear producto"}
     </h2>

        {/* ─────────── LEFT: FORM ─────────── */}
        <form className="pizza-form" onSubmit={onSubmit}>
          <div className="pc-grid">
            {/* DATOS DEL PRODUCTO */}
            <section className="pc-section">
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Datos del producto</div>

              <label>
                Nombre
                <input name="name" value={form.name} onChange={onChange} required />
              </label>

              <label>
                Categoría
                <select name="category" value={form.category} onChange={onChange} required>
                  <option value="">– elegir –</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Tamaños y precios</div>

                <div className="pc-sizesRow">
                  {sizeList.map((sz) => {
                    const checked = form.sizes.includes(sz);
                    return (
                      <div key={sz} className="pc-sizeItem">
                        <label style={{ display: "flex", gap: 6, margin: 0 }}>
                          <input type="checkbox" value={sz} checked={checked} onChange={onSizeToggle} />
                          <strong>{sz}</strong>
                        </label>

                        <input
                          type="number"
                          placeholder="€"
                          value={form.priceBySize[sz]}
                          onChange={(e) => onPriceChange(e, sz)}
                          disabled={!checked}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* ARMA TU PIZZA */}
            <section className="pc-section">
              <h3 className="pc-subtitle">Arma tu pizza</h3>

              {!selectedSizes.length && (
                <div style={{ opacity: 0.75, fontWeight: 700 }}>
                  Selecciona al menos un tamaño para poder poner cantidades.
                </div>
              )}

              <fieldset className="ingredients-fieldset">
                {form.ingredients.map((row, i) => (
                  <div key={i} className="ing-row">
                    <select value={row.id} onChange={(e) => onIngredientSelect(i, e.target.value)}>
                      <option value="">– ingrediente –</option>
                      {inventory.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>

                    {selectedSizes.map((sz) => (
                      <div key={`${i}-${sz}`} className="ing-col">
                        {sz}
                        <input
                          type="number"
                          className="ing-qty"
                          value={(row.qtyBySize || {})[sz] ?? 0}
                          onChange={(e) => onQtyChange(i, sz, e.target.value)}
                        />
                      </div>
                    ))}

                    <button type="button" onClick={() => removeIngredient(i)}>
                      ✕
                    </button>
                  </div>
                ))}

                <button type="button" onClick={addIngredient}>
                  + Añadir ingrediente
                </button>
              </fieldset>
            </section>

            {/* IMAGEN */}
            <section className="pc-section">
              <h3 className="pc-subtitle">Imagen</h3>
                {existingImage && !form.imageFile && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Imagen actual</div>
                    <img
                      src={existingImage}
                      alt="actual"
                      style={{ width: 120, borderRadius: 8, border: "1px solid #ddd" }}
                    />
                  </div>
                )}
              <input type="file" accept="image/*" onChange={onImageSelect} />

              {form.imageFile && (
                <div style={{ marginTop: 8, opacity: 0.8, fontWeight: 700 }}>
                  Seleccionado: {form.imageFile.name}
                </div>
              )}
            </section>

            <button className="save-btn" type="submit">
              Guardar producto
            </button>
            {editingPizzaId && (
            <button
              type="button"
              onClick={() => {
                setEditingPizzaId(null);
                setExistingImage(null);
                setForm({
                  name: "",
                  category: "",
                  sizes: [],
                  priceBySize: { S:"", M:"", L:"", XL:"", XXL:"", ST:"" },
                  imageFile: null,
                  ingredients: [],
                });
              }}
              style={{
                marginTop: 10,
                background: "#eee",
                border: "1px solid #ccc",
                borderRadius: 10,
                padding: "10px 12px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Cancelar edición
            </button>
          )}
          </div>
        </form>

        {/* ─────────── RIGHT: CATEGORÍAS ─────────── */}
        <aside className="pc-right">
          <div className="pc-right__title">Categorías</div>

          <div className="pc-catsGrid">
            {categoryOptions.map((c) => {
              const count = (pizzasByCategory[c] || []).length;
              return (
                <button key={c} type="button" className="pc-catCard" onClick={() => setOpenCat(c)}>
                  <div className="pc-catCard__name">{c}</div>
                  <div className="pc-catCard__count">{count} productos</div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      {/* ─────────── MODAL POR CATEGORÍA ─────────── */}
    <Modal
      open={!!openCat}
      title={openCat ? `${openCat} • ${(pizzasByCategory[openCat] || []).length}` : ""}
      onClose={() => setOpenCat(null)}
    >
      <div style={{ marginTop: 12 }}>
        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={onPizzaDragEnd}
        >
          <SortableContext
            items={pizzaOrderByCat[openCat] || []}
            strategy={verticalListSortingStrategy}
          >
            <div style={{ display: "grid", gap: 10 }}>
              {(pizzaOrderByCat[openCat] || []).map((pizzaId) => {
                const p = (pizzasByCategory[openCat] || []).find(
                  (x) => x.id === pizzaId
                );
                if (!p) return null;

                const st = p.status;
                const badgeBg =
                  st === "INACTIVE"
                    ? "rgba(255, 59, 48, 0.08)"
                    : "rgba(34, 197, 94, 0.10)";
                const badgeBorder =
                  st === "INACTIVE"
                    ? "rgba(255, 59, 48, 0.25)"
                    : "rgba(34, 197, 94, 0.25)";

                return (
                  <SortablePizza key={p.id} id={p.id}>
                    {(listeners) => (
                      <div
                        style={{
                          border: "1px solid #eee",
                          borderRadius: 14,
                          padding: 12,
                          display: "grid",
                          gridTemplateColumns: "auto 1fr auto",
                          gap: 12,
                          alignItems: "center",
                        }}
                      >
                        {/* DRAG HANDLE */}
                        <span
                          {...listeners}
                          style={{
                            cursor: "grab",
                            fontSize: 20,
                            userSelect: "none",
                            opacity: 0.6,
                          }}
                          title="Arrastrar"
                        >
                          ≡
                        </span>

                        {/* LEFT: info compacta */}
                        <div style={{ minWidth: 0 }}>
                          {/* Nombre */}
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: 16,
                              marginBottom: 6,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.name}
                          </div>

                          {/* Línea compacta */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            {/* STATUS */}
                            <span
                              style={{
                                border: `1px solid ${badgeBorder}`,
                                background: badgeBg,
                                borderRadius: 999,
                                padding: "4px 8px",
                                fontWeight: 900,
                              }}
                            >
                              {st}
                            </span>

                            {/* PRECIOS */}
                            {p.priceBySize &&
                              Object.entries(p.priceBySize)
                                .filter(([_, v]) => v)
                                .map(([sz, price]) => (
                                  <span
                                    key={sz}
                                    style={{
                                      border: "1px solid #ddd",
                                      borderRadius: 8,
                                      padding: "4px 6px",
                                    }}
                                  >
                                    {sz}: €{price}
                                  </span>
                                ))}

                            {/* INGREDIENTES */}
                            {p.ingredients?.map((ing) => (
                              <span
                                key={ing.id}
                                title={ing.name}
                                style={{
                                  border: "1px solid #ccc",
                                  borderRadius: 6,
                                  padding: "3px 6px",
                                  fontWeight: 700,
                                  cursor: "help",
                                  color:
                                    ing.status === "INACTIVE"
                                      ? "#ff3b30"
                                      : "#333",
                                  background: "#fafafa",
                                }}
                              >
                                #{ing.id}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* RIGHT: acciones */}
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => loadPizzaForEdit(p)}
                            style={{
                              border: "1px solid #333",
                              background: "#fff",
                              borderRadius: 12,
                              padding: "10px 12px",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => deletePizza(p.id)}
                            style={{
                              border: "1px solid #ff3b30",
                              background: "#fff",
                              borderRadius: 12,
                              padding: "10px 12px",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </SortablePizza>
                );
              })}

              {openCat &&
                (pizzaOrderByCat[openCat]?.length ?? 0) === 0 && (
                  <div style={{ opacity: 0.7, fontWeight: 700 }}>
                    No hay productos en esta categoría.
                  </div>
                )}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </Modal>
    </>
  );
}
