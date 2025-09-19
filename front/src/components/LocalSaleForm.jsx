// ──────────────────────────────────────────────────────────────
// LocalSaleForm – modo normal y modo “compact + forcedStoreId”
//  • onConfirmCart (opcional) → devuelve carrito sin guardar
//  • EXTRAS: vienen de /api/menuDisponible/:storeId (category='Extras')
// ──────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import api from "../setupAxios";
import { useAuth } from "./AuthContext";
import "../styles/LocalSaleForm.css";

const categories = ["Pizza", "Sides", "Drinks", "Desserts"]; // ocultamos “Extras” al usuario
const normalize = (c) => (c || "Pizza").trim().toLowerCase();
const CATEGORY_LABELS = {
  pizza: "Pizza",
  sides: "Entradas",
  drinks: "Bebidas",
  desserts: "Postres",
  extras: "Extras",
};
const displayCategory = (c) => CATEGORY_LABELS[normalize(c)] ?? c ?? "";

/* Toast vía portal */
function Toast({ msg, onClose }) {
  if (!msg) return null;
  return ReactDOM.createPortal(
    <div className="lsf-toast" onClick={onClose}>
      <span className="lsf-toast-icon">✓</span>
      <span className="lsf-toast-text">{msg}</span>
    </div>,
    document.body
  );
}

/* ───────── Helpers ───────── */
const parseMaybeJSON = (v, fallback) => {
  try { return typeof v === "string" ? JSON.parse(v) : (v ?? fallback); }
  catch { return fallback; }
};
const num = (x) => {
  if (x == null || x === "") return 0;
  const s = typeof x === "string" ? x.replace(",", ".") : x;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const priceForSize = (priceBySize = {}, size = "M") => {
  const pref = num(priceBySize?.[size]);
  if (pref > 0) return pref;
  for (const k of ["M", "S", "L", "XL", "XS"]) {
    const v = num(priceBySize?.[k]);
    if (v > 0) return v;
  }
  for (const v of Object.values(priceBySize || {})) {
    const n = num(v);
    if (n > 0) return n;
  }
  return 0;
};
const coerceRow = (row) => ({
  pizzaId    : row.pizzaId ?? row.id,
  name       : row.name,
  category   : row.category,
  selectSize : parseMaybeJSON(row.selectSize, []) || [],
  priceBySize: parseMaybeJSON(row.priceBySize, {}) || {},
  stock      : row.stock ?? null,
});

// detectar "Margarita/Marguerita" con variantes
const isMargarita = (name = "") => /marg[ua]r?ita/i.test(String(name));

export default function LocalSaleForm({
  forcedStoreId = null,
  compact = false,
  customer = null,
  onDone = () => {},
  onConfirmCart = null,
}) {
  const { auth } = useAuth();
  const isAdmin = auth?.role === "admin";

  /* state */
  const [storeId, setStoreId] = useState(forcedStoreId);
  const [stores, setStores] = useState([]);
  const [menu, setMenu] = useState([]);                 // menú completo (incluye Extras)
  const [cat, setCat] = useState("Pizza");
  const [cart, setCart] = useState([]);
  const [sel, setSel] = useState({ pizzaId: "", size: "", qty: 1, extras: {} });
  const [toast, setToast] = useState(null);

  // errores visuales de la línea actual
  const [errors, setErrors] = useState({ item: false, size: false });
  const [triedAdd, setTriedAdd] = useState(false);   // intentó agregar con errores
  const [shakeAdd, setShakeAdd] = useState(false);   // para relanzar la animación
  const MAX_QTY_SELECT = 12;

  /* effects */
  useEffect(() => {
    if (forcedStoreId) return;
    if (isAdmin) {
      api.get("/api/stores").then(r => setStores(r.data)).catch(() => setStores([]));
    } else if (auth?.storeId) {
      setStoreId(auth.storeId);
    }
  }, [forcedStoreId, isAdmin, auth?.storeId]);

  // Carga TODO el menú de la tienda (sin ?category=)
  useEffect(() => {
    if (!storeId) return;
    api.get(`/api/menuDisponible/${storeId}`)
      .then(r => {
        const arr = Array.isArray(r.data) ? r.data : [];
        setMenu(arr.map(coerceRow));
      })
      .catch(() => setMenu([]));
  }, [storeId]);

  // reset selección al cambiar categoría
  useEffect(() => {
    setSel({ pizzaId: "", size: "", qty: 1, extras: {} });
    setErrors({ item: false, size: false });
    setTriedAdd(false);
  }, [cat]);

  // limpiar errores al corregir
  useEffect(() => {
    if (sel.pizzaId) setErrors(e => ({ ...e, item: false }));
    setTriedAdd(false);
  }, [sel.pizzaId]);
  useEffect(() => {
    if (sel.size) setErrors(e => ({ ...e, size: false }));
    setTriedAdd(false);
  }, [sel.size]);

  /* memo/selectores */
  const itemsAvail = useMemo(
    () => menu.filter(m => normalize(m.category) === normalize(cat) && (m.stock == null || m.stock > 0)),
    [menu, cat]
  );
  const current = menu.find(m => m.pizzaId === Number(sel.pizzaId));

  /* ===== Auto-select size si el producto solo tiene uno ===== */
  useEffect(() => {
    const sizes = (current?.selectSize || []).filter(Boolean);
    setSel((s) => {
      if (!current) return s.size ? { ...s, size: "" } : s;
      if (sizes.length === 1 && s.size !== sizes[0]) {
        return { ...s, size: sizes[0] };
      }
      if (s.size && !sizes.includes(s.size)) {
        return { ...s, size: "" };
      }
      return s;
    });
  }, [current]);

  // 🔸 Auto-seleccionar “Marguerita” (o 1ª pizza) cuando la categoría sea Pizza
  useEffect(() => {
    if (normalize(cat) !== "pizza") return;
    const pizzas = menu.filter(
      (m) => normalize(m.category) === "pizza" && (m.stock == null || m.stock > 0)
    );
    if (!pizzas.length) return;
    const def = pizzas.find((p) => isMargarita(p.name)) || pizzas[0];
    setSel((s) => {
      const idStr = String(def.pizzaId);
      if (s.pizzaId === idStr) return s;
      return { ...s, pizzaId: idStr, size: "", extras: {} };
    });
  }, [cat, menu]);

  // Extras (de la misma respuesta, category='Extras')
const extrasAvail = useMemo(
  () => menu.filter(m => normalize(m.category) === "extras" && (m.stock == null || m.stock > 0)),
  [menu]
);

  const baseUnitPrice = current && sel.size ? priceForSize(current.priceBySize, sel.size) : 0;
const extrasUnitTotal = useMemo(() => {
  // lista de precios de extras seleccionados en orden estable (extrasAvail)
  const selectedPrices = extrasAvail
    .filter(ex => !!sel.extras[ex.pizzaId])
    .map(ex => priceForSize(ex.priceBySize, sel.size || "M"));

  if (selectedPrices.length === 0) return 0;

  // resta el primero (gratis)
  const sum = selectedPrices.reduce((s, p) => s + (Number(p) || 0), 0);
  return Math.max(0, sum - (Number(selectedPrices[0]) || 0));
}, [sel.extras, sel.size, extrasAvail]);

  const linePreview = (baseUnitPrice + extrasUnitTotal) * Number(sel.qty || 1);

  /* ===== Cantidad: opciones según stock / tope ===== */
  const qtyOptions = useMemo(() => {
    const hardMax = MAX_QTY_SELECT;
    const stockMax = current?.stock == null ? hardMax : Number(current.stock);
    const n = Math.max(1, Math.min(hardMax, stockMax));
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [current?.stock]);

  // Si cambian las opciones, encajar qty dentro del rango
  useEffect(() => {
    const max = qtyOptions[qtyOptions.length - 1] || 1;
    setSel((s) => ({ ...s, qty: Math.min(Math.max(1, Number(s.qty || 1)), max) }));
  }, [qtyOptions]);

  /* handlers */
  const toggleExtra = (id) =>
    setSel(s => ({ ...s, extras: { ...s.extras, [id]: !s.extras[id] } }));

  const addLine = () => {
    const invalidItem = !current;
    const invalidSize = !sel.size;

    if (invalidItem || invalidSize) {
      setErrors({ item: invalidItem, size: invalidSize });
      setTriedAdd(true);
      setShakeAdd(false);
      requestAnimationFrame(() => setShakeAdd(true));
      setTimeout(() => setShakeAdd(false), 380);
      return;
    }

    const price = baseUnitPrice;
    if (price == null) return alert("Price not set");
    if (current.stock != null && current.stock < sel.qty) return alert("Not enough stock");

  const chosenIds = extrasAvail
  .filter(x => sel.extras[x.pizzaId])       // orden estable por extrasAvail
  .map(x => String(x.pizzaId));
let chosenExtras = chosenIds
  .map(idStr => {
    const ex = extrasAvail.find(x => x.pizzaId === Number(idStr));
    return ex ? {
      id: ex.pizzaId,
      name: ex.name,
      price: priceForSize(ex.priceBySize, sel.size || "M"),
    } : null;
  })
  .filter(Boolean);
if (chosenExtras.length > 0) {
  chosenExtras = [{ ...chosenExtras[0], price: 0 }, ...chosenExtras.slice(1)];
}
const extrasPerUnit = chosenExtras.reduce((a, b) => a + num(b.price), 0);
const subtotal = (price + extrasPerUnit) * sel.qty;

setCart(c => [...c, {
  pizzaId : current.pizzaId,
  name    : current.name,
  category: current.category,
  size    : sel.size,
  qty     : sel.qty,
  price,                 // base unit
  extras  : chosenExtras, // ← ya incluye el primero con precio 0
  subtotal,              // incluye extras (con el 1º gratis)
}]);

    setSel({ pizzaId: "", size: "", qty: 1, extras: {} });
    setTriedAdd(false);
  };

  const total = cart.reduce((t, l) => t + l.subtotal, 0);

  if (!storeId && !isAdmin && !forcedStoreId) return <p className="msg">Select store…</p>;

  /* UI */
  return (
    <>
      <div className={compact ? "lsf-wrapper compact" : "lsf-wrapper"}>
        {compact ? (
          <>
            <h3 className="pc-subtitle">Selecciona de la lista</h3>
            <p className="pc-note">
              Elige una <b>categoría</b> (Pizzas, Bebidas…), luego el <b>item</b>, <b>size</b> y <b>cantidad</b>. Pulsa <b>Add</b>.
            </p>
          </>
        ) : (
          <h3>Local sale</h3>
        )}

        {/* selector tienda (backoffice) */}
        {!forcedStoreId && isAdmin && (
          <div className="row">
            {!compact && <label className="lbl">Store:</label>}
            <select value={storeId || ""} onChange={(e) => setStoreId(Number(e.target.value))}>
              <option value="">– choose store –</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.storeName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* categoría */}
        <div className="row">
          {!compact && <label className="lbl">Categoría:</label>}
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {displayCategory(c)}
              </option>
            ))}
          </select>
        </div>

        {/* formulario de línea */}
        <div className="line lsf-line">

          {/* Producto */}
          <div className="lsf-box">
            <label className="lsf-label">Producto</label>

            {normalize(cat) === "pizza" ? (
              // Pizza: fijo a Marguerita (o 1ª disponible), sin selector
              <div className="lsf-field lsf-field--static" aria-live="polite">
                {current?.name || "Marguerita"}
              </div>
            ) : (
              // Otras categorías: selector normal
              <select
                className={`lsf-field ${triedAdd && errors.item ? "is-error" : ""}`}
                value={sel.pizzaId}
                onChange={(e) =>
                  setSel({
                    ...sel,
                    pizzaId: e.target.value,
                    size: "",
                    extras: {},
                  })
                }
              >
                <option value="">– item –</option>
                {itemsAvail.map(it => (
                  <option key={it.pizzaId} value={it.pizzaId}>
                    {it.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Size + Cantidad (50/50) */}
          <div className="lsf-pair">
            {/* Size */}
            <div className="lsf-box">
              <label className="lsf-label">Size</label>
              <select
                className={`lsf-field ${triedAdd && errors.size ? "is-error" : ""}`}
                value={sel.size}
                disabled={!current}
                onChange={(e) => setSel({ ...sel, size: e.target.value })}
              >
                <option value="">size</option>
                {current?.selectSize?.map(sz => (
                  <option key={sz} value={sz}>
                    {sz} €{priceForSize(current.priceBySize, sz).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            {/* Cantidad (selector) */}
            <div className="lsf-box">
              <label htmlFor="lsf_qty" className="lsf-label">Cantidad</label>
              <select
                id="lsf_qty"
                className="lsf-field lsf-field--qty"
                value={String(sel.qty)}
                onChange={(e) => setSel({ ...sel, qty: Number(e.target.value) })}
                disabled={!current}
              >
                {qtyOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Extras – sólo para Pizza */}
          {current && normalize(current.category) === "pizza" && (
            <details className="lsf-extras" open>
              <summary className="lsf-extras__summary">
            <span className="lsf-extras__title">Extras</span>
            <span className="lsf-extras__opt lsf-opt-bounce">(1º Gratis)</span>
          </summary>
              {extrasAvail.length === 0 ? (
                <div className="lsf-extras__empty">No hay extras para este producto.</div>
              ) : (
                <div className="lsf-extras__list">
                  {extrasAvail.map(ex => {
                    const price = priceForSize(ex.priceBySize, sel.size || "M");
                    const checked = !!sel.extras[ex.pizzaId];
                    return (
                      <label key={ex.pizzaId} className="lsf-extras__item">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleExtra(ex.pizzaId)}
                        />
                        <span className="lsf-extras__name">{ex.name}</span>
                        <span className="lsf-extras__price">+€{price.toFixed(2)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </details>
          )}

          {/* Vista previa de subtotal */}
          {current && sel.size && (
            <div className="lsf-line-preview">
              Subtotal línea: <b>€{linePreview.toFixed(2)}</b>
            </div>
          )}

          {/* Botón Add */}
          <button
            className={`ADDBTN ${triedAdd && (errors.item || errors.size) && shakeAdd ? "is-error pc-shake" : ""}`}
            onClick={addLine}
          >
            Add
          </button>
        </div>

        {/* tabla + total + confirmar */}
        {cart.length > 0 && (
          <>
            <table className="ing-table mini">
              <thead>
                <tr>
                  <th>✕</th>
                  {!compact && <th>Cat.</th>}
                  <th>Item</th>
                  <th>Size</th>
                  <th>Qty</th>
                  <th>€</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <button
                        className="del-row"
                        onClick={() => setCart((c) => c.filter((_, idx) => idx !== i))}
                      >
                        ✕
                      </button>
                    </td>
                    {!compact && <td>{l.category}</td>}
                    <td>
                      {l.name}
                      {l.extras?.length ? (
                        <div className="ing-note">+ {l.extras.map((e) => e.name).join(", ")}</div>
                      ) : null}
                    </td>
                    <td>{l.size}</td>
                    <td>{l.qty}</td>
                    <td>{l.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="total">Total: €{total.toFixed(2)}</p>

            <button
              className="btn-confirm"
              onClick={async () => {
                const extrasArrayForItem = (line) =>
                  (line.extras || []).map((e) => ({
                    id: e.id,
                    code: "EXTRA",
                    label: e.name,
                    amount: Number(e.price) || 0, // precio unitario del extra
                  }));

                const extrasMapForItem = (line) =>
                  Object.fromEntries((line.extras || []).map((e) => [e.id, true]));

                if (onConfirmCart) {
                  if (!storeId) return alert("Select store");
                  onConfirmCart({
                    storeId: Number(storeId),
                    items: cart.map((c) => ({
                      pizzaId: c.pizzaId,
                      name: c.name,
                      size: c.size,
                      qty: c.qty,
                      price   : c.price,
                      subtotal: c.subtotal,
                      extras: extrasArrayForItem(c),
                      extrasMap: extrasMapForItem(c),
                    })),
                    total,
                  });
                  return;
                }

                // ---- Branch /api/sales (backoffice) ----
                try {
                  const aggregatedExtras = cart.flatMap((c) =>
                    (c.extras || []).map((e) => ({
                      code: "EXTRA",
                      label: e.name,
                      amount: (Number(e.price) || 0) * Number(c.qty || 1),
                    }))
                  );

                  const payload = {
                    storeId,
                    type: forcedStoreId ? "DELIVERY" : "LOCAL",
                    delivery: forcedStoreId ? "COURIER" : "PICKUP",
                    products: cart.map((c) => ({
                      pizzaId: c.pizzaId,
                      size: c.size,
                      qty: c.qty,
                      price: c.price, // base unitario
                      extras: extrasArrayForItem(c),
                    })),
                    totalProducts: cart.reduce((t, l) => t + Number(l.price || 0) * Number(l.qty || 1), 0),
                    discounts: 0,
                    total, // incluye extras
                    extras: aggregatedExtras,
                  };
                  if (customer?.phone?.trim()) payload.customer = customer;

                  await api.post("/api/sales", payload);
                  setToast("Sale saved ✓");
                  setCart([]);
                  setTimeout(() => onDone(), 2000);
                } catch (e) {
                  console.error(e);
                  alert(e.response?.data?.error || "Error");
                }
              }}
            >
              {onConfirmCart ? "Confirmar carrito" : "Confirm sale"}
            </button>
          </>
        )}
      </div>

      <Toast msg={toast} onClose={() => setToast(null)} />
    </>
  );
}
