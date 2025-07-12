import React, { useState, useEffect } from "react";
import api   from "../setupAxios";
import "../styles/PizzaCreator.css";

/* ---------------------- constantes ---------------------- */
const sizeList = ["S", "M", "L", "XL", "XXL", "ST"];
const cookingMethods = [
  "Baked",
  "Steamed",
  "Boiled",
  "Sautéed",
  "Fried",
  "Grilled",
  "Wood-fired",
  "Slow-cooked",
];
const categoryOptions = [
  "Pizza", // pizzas completas
  "Extras", // toppings extra
  "Sides", // complementos
  "Drinks", // bebidas
  "Desserts", // postres
];

/* ======================================================== */
/**
 * Componente: PizzaCreator
 * Pantalla de alta de pizzas + tabla con filtro y orden.
 */
export default function PizzaCreator() {
  /* ---------- form state ---------- */
  const [form, setForm] = useState({
    name: "",
    category: "",
    sizes: [],
    priceBySize: { S: "", M: "", L: "", XL: "", XXL: "", ST: "" },
    cookingMethod: "",
    imageFile: null,
    ingredients: [],
  });

  /* ---------- inventory para dropdown ---------- */
  const [inventory, setInventory] = useState([]);
  useEffect(() => {
    axios
      .get("http://localhost:8080/api/ingredients")
      .then((r) => setInventory(r.data))
      .catch(console.error);
  }, []);

  /* ---------- lista de pizzas ---------- */
  const [pizzas, setPizzas] = useState([]);
  const fetchPizzas = () =>
    axios
      .get("http://localhost:8080/api/pizzas")
      .then((r) => setPizzas(r.data))
      .catch(console.error);

  useEffect(() => {
    fetchPizzas();
  }, []);

  /* ---------- filtros y orden ---------- */
  const [filterCat, setFilterCat] = useState("ALL");
  const [sortAsc, setSortAsc] = useState(true);
  const toggleSortByName = () => setSortAsc((a) => !a);

  /* ---------- handlers varios ---------- */
  const onChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const onSizeToggle = (e) => {
    const { value, checked } = e.target;
    setForm((p) => ({
      ...p,
      sizes: checked ? [...p.sizes, value] : p.sizes.filter((s) => s !== value),
    }));
  };

  const onPriceChange = (e, sz) =>
    setForm((p) => ({
      ...p,
      priceBySize: { ...p.priceBySize, [sz]: e.target.value },
    }));

  const onImageSelect = (e) =>
    setForm((p) => ({ ...p, imageFile: e.target.files?.[0] || null }));

  /* ---------- helpers de ingredientes ---------- */
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
      ing[i].qtyBySize[sz] = val;
      return { ...p, ingredients: ing };
    });

  /* ---------- guardar pizza ---------- */
  const onSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("name", form.name.trim());
    fd.append("category", form.category);
    fd.append("sizes", JSON.stringify(form.sizes));
    fd.append("priceBySize", JSON.stringify(form.priceBySize));
    fd.append("cookingMethod", form.cookingMethod);
    fd.append("ingredients", JSON.stringify(form.ingredients));
    if (form.imageFile) fd.append("image", form.imageFile);

    try {
      await api.post("http://localhost:8080/api/pizzas", fd);
      alert("Pizza saved!");
      setForm({
        name: "",
        category: "",
        sizes: [],
        priceBySize: { S: "", M: "", L: "", XL: "", XXL: "", ST: "" },
        cookingMethod: "",
        imageFile: null,
        ingredients: [],
      });
      fetchPizzas();
    } catch (err) {
      console.error(err);
      alert("Error saving pizza");
    }
  };

  /* ---------- eliminar pizza ---------- */
  const deletePizza = async (id) => {
    if (!window.confirm("Delete this pizza?")) return;
    try {
      await axios.delete(`http://localhost:8080/api/pizzas/${id}`);
      setPizzas((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  /* ====================================================== */
  return (
    <>
      {/* ─────────── FORMULARIO ─────────── */}
      <form className="pizza-form" onSubmit={onSubmit}>
        <div className="pc-grid">
          <h2 className="pc-title">Create Pizza</h2>

          {/* Nombre */}
          <label>
            Name
            <input
              name="name"
              value={form.name}
              onChange={onChange}
              required
            />
          </label>

          {/* Categoría */}
          <label>
            Category
            <select
              name="category"
              value={form.category}
              onChange={onChange}
              required
            >
              <option value="">– choose –</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {/* Tamaños y precios */}
          <fieldset className="sizes-fieldset">
            <legend>Sizes & Prices</legend>
            {sizeList.map((sz) => (
              <div key={sz} className="size-box">
                <label>
                  <input
                    type="checkbox"
                    value={sz}
                    checked={form.sizes.includes(sz)}
                    onChange={onSizeToggle}
                  />
                  {" "}
                  {sz}
                </label>
                {form.sizes.includes(sz) && (
                  <input
                    type="number"
                    placeholder={`$ ${sz}`}
                    value={form.priceBySize[sz]}
                    onChange={(e) => onPriceChange(e, sz)}
                  />
                )}
              </div>
            ))}
          </fieldset>

          {/* Método de cocción */}
          <label>
            Cooking Method
            <select
              name="cookingMethod"
              value={form.cookingMethod}
              onChange={onChange}
            >
              <option value="">– choose –</option>
              {cookingMethods.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>

          {/* Ingredientes */}
          <fieldset className="ingredients-fieldset">
            <legend>Ingredients</legend>
            {form.ingredients.map((row, i) => (
              <div key={i} className="ing-row">
                <select
                  value={row.id}
                  onChange={(e) => onIngredientSelect(i, e.target.value)}
                >
                  <option value="">– select –</option>
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>

                {form.sizes.map((sz) => (
                  <div key={`${i}-${sz}`} className="ing-col">
                    {sz}
                    <input
                      type="number"
                      className="ing-qty"
                      value={row.qtyBySize[sz]}
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
              + Add ingredient
            </button>
          </fieldset>

          {/* Imagen */}
          <label>
            Image
            <input type="file" accept="image/*" onChange={onImageSelect} />
          </label>

          {/* Guardar */}
          <button className="save-btn">Save pizza</button>
        </div>
      </form>

      {/* ─────────── CONTROLES DE TABLA ─────────── */}
      <div className="table-controls">
        <label>
          Filter
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="ALL">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ─────────── TABLA ─────────── */}
      <div className="table-wrapper">
        <table className="ing-table">
          <thead>
            <tr>
              <th>Delete</th>
              <th
                onClick={toggleSortByName}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                Name {sortAsc ? "▲" : "▼"}
              </th>
              <th>Category</th>
              <th>Sizes</th>
            </tr>
          </thead>
          <tbody>
            {pizzas
              .filter((p) => filterCat === "ALL" || p.category === filterCat)
              .sort((a, b) =>
                sortAsc
                  ? a.name.localeCompare(b.name)
                  : b.name.localeCompare(a.name)
              )
              .map((p) => (
                <tr key={p.id}>
                  <td>
                    <button className="del-btn" onClick={() => deletePizza(p.id)}>
                      ✕
                    </button>
                  </td>
                  <td>{p.name}</td>
                  <td>{p.category}</td>
                  <td>{p.selectSize.join(", ")}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
