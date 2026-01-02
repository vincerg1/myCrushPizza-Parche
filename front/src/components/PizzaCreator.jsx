// ─────────────────────────────────────────────────────────────
// src/components/PizzaCreator.jsx
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import api from "../setupAxios";
import "../styles/PizzaCreator.css";

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



  /* ---------- handlers (form) ---------- */
  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const onSizeToggle = (e) => {
    const { value, checked } = e.target;
    setForm((p) => {
      const nextSizes = checked ? [...p.sizes, value] : p.sizes.filter((s) => s !== value);

      const nextIngredients = p.ingredients.map((row) => {
        const qtyBySize = { ...(row.qtyBySize || {}) };
        if (!checked) delete qtyBySize[value];
        return { ...row, qtyBySize };
      });

      return { ...p, sizes: nextSizes, ingredients: nextIngredients };
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
      await api.post("/api/pizzas", fd);
      alert("Producto guardado");
      setForm({
        name: "",
        category: "",
        sizes: [],
        priceBySize: { S: "", M: "", L: "", XL: "", XXL: "", ST: "" },
        imageFile: null,
        ingredients: [],
      });
      fetchPizzas();

      // refresca status la próxima vez que abras el modal
      setStatusMap({});
      setStatusFetchState({ loading: false, loadedOnce: false });
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

      setStatusMap((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
    } catch (e) {
      console.error(e);
      alert("No se pudo eliminar");
    }
  };

  const selectedSizes = form.sizes;

  /* ====================================================== */
  return (
    <>
      <div className="pc-layout">
        <h2 className="pc-title">Crear producto</h2>

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

              {/* TAMAÑOS Y PRECIOS */}
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
              <input type="file" accept="image/*" onChange={onImageSelect} />

              {form.imageFile && (
                <div style={{ marginTop: 8, opacity: 0.8, fontWeight: 700 }}>
                  Seleccionado: {form.imageFile.name}
                </div>
              )}
            </section>

            {/* BOTÓN ABAJO, SOLO */}
            <button className="save-btn" type="submit">
              Guardar producto
            </button>
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ opacity: 0.75, fontWeight: 700 }}>
            Estado calculado (depende de ingredientes ACTIVE/INACTIVE).
          </div>

          <button
            type="button"
            onClick={() => fetchAllProductStatus(true)}
            style={{
              border: "1px solid #e7e7e7",
              background: "#fff",
              borderRadius: 12,
              padding: "10px 12px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Recargar
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {(openCat ? pizzasByCategory[openCat] : [])?.map((p) => {
            const st = p.status;

            return (
              <div
                key={p.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 14,
                  padding: 12,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>

                  <div style={{ opacity: 0.75, fontWeight: 800, fontSize: 12 }}>
                    Tamaños: {Array.isArray(p.selectSize) ? p.selectSize.join(", ") : ""}
                  </div>

                  <div style={{ opacity: 0.7, fontWeight: 700, fontSize: 12 }}>Imagen: {p.image || "—"}</div>

                  <div
                    style={{
                      marginTop: 8,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      border: "1px solid #eee",
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontWeight: 900,
                      fontSize: 12,
                      opacity: statusFetchState.loading && !statusFetchState.loadedOnce ? 0.65 : 1,
                      background:
                        st === "INACTIVE" ? "rgba(255, 59, 48, 0.08)" : "rgba(34, 197, 94, 0.10)",
                      borderColor:
                        st === "INACTIVE" ? "rgba(255, 59, 48, 0.25)" : "rgba(34, 197, 94, 0.25)",
                    }}
                    title="Estado calculado por ingredientes"
                  >
                    {statusFetchState.loading && !statusFetchState.loadedOnce ? "STATUS…" : `STATUS: ${st || "—"}`}
                  </div>

                  {stObj?.blockedBy?.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, opacity: 0.8 }}>
                      Bloqueado por:{" "}
                      {stObj.blockedBy
                        .map((x) => x?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  )}
                </div>

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
            );
          })}

          {openCat && (pizzasByCategory[openCat] || []).length === 0 && (
            <div style={{ opacity: 0.7, fontWeight: 700 }}>No hay productos en esta categoría.</div>
          )}
        </div>
      </Modal>
    </>
  );
}
