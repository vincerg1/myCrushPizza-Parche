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
      // si no hay producto, limpia size si venía marcado
      if (!current) return s.size ? { ...s, size: "" } : s;

      // si solo hay un size y aún no está puesto → colócalo
      if (sizes.length === 1 && s.size !== sizes[0]) {
        return { ...s, size: sizes[0] };
      }

      // si el size actual no existe para el nuevo producto → limpia
      if (s.size && !sizes.includes(s.size)) {
        return { ...s, size: "" };
      }

      return s;
    });
  }, [current]);

  // Extras (de la misma respuesta, category='Extras')
  const extrasAvail = useMemo(
    () => menu.filter(m => normalize(m.category) === "extras" && (m.stock == null || m.stock > 0)),
    [menu]
  );

  const baseUnitPrice = current && sel.size ? priceForSize(current.priceBySize, sel.size) : 0;
  const extrasUnitTotal = useMemo(() => {
    const ids = Object.keys(sel.extras).filter(id => sel.extras[id]);
    return ids.reduce((sum, idStr) => {
      const ex = extrasAvail.find(x => x.pizzaId === Number(idStr));
      return sum + (ex ? priceForSize(ex.priceBySize, sel.size || "M") : 0);
    }, 0);
  }, [sel.extras, sel.size, extrasAvail]);

  const linePreview = (baseUnitPrice + extrasUnitTotal) * Number(sel.qty || 1);

  /* handlers */
  const toggleExtra = (id) =>
    setSel(s => ({ ...s, extras: { ...s.extras, [id]: !s.extras[id] } }));

  const addLine = () => {
    const invalidItem = !current;
    const invalidSize = !sel.size;

    if (invalidItem || invalidSize) {
      setErrors({ item: invalidItem, size: invalidSize });
      setTriedAdd(true);

      // re-dispara la animación del botón Add
      setShakeAdd(false);
      requestAnimationFrame(() => setShakeAdd(true));
      setTimeout(() => setShakeAdd(false), 380);
      return;
    }

    const price = baseUnitPrice;
    if (price == null) return alert("Price not set");
    if (current.stock != null && current.stock < sel.qty) return alert("Not enough stock");

    const chosenIds = Object.keys(sel.extras).filter(id => sel.extras[id]);
    const chosenExtras = chosenIds
      .map(idStr => {
        const ex = extrasAvail.find(x => x.pizzaId === Number(idStr));
        return ex ? {
          id: ex.pizzaId,
          name: ex.name,
          price: priceForSize(ex.priceBySize, sel.size),
        } : null;
      })
      .filter(Boolean);

    const extrasPerUnit = chosenExtras.reduce((a, b) => a + num(b.price), 0);
    const subtotal = (price + extrasPerUnit) * sel.qty;

    setCart(c => [...c, {
      pizzaId : current.pizzaId,
      name    : current.name,
      category: current.category,
      size    : sel.size,
      qty     : sel.qty,
      price,                 // base unit
      extras  : chosenExtras, // detalles de extras
      subtotal,              // incluye extras
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
          {!compact && <label className="lbl">Category:</label>}
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* formulario de línea */}
        <div className="line lsf-line">

          {/* Producto */}
          <div className="lsf-box">
            <label className="lsf-label">Producto</label>
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

            {/* Cantidad */}
            <div className="lsf-box">
              <label htmlFor="lsf_qty" className="lsf-label">
                Cantidad
              </label>
              <input
                id="lsf_qty"
                className="lsf-field"
                type="number"
                min="1"
                step="1"
                value={sel.qty}
                onChange={(e) =>
                  setSel({
                    ...sel,
                    qty: Math.max(1, Number(e.target.value || 1)),
                  })
                }
              />
            </div>
          </div>

          {/* Extras – sólo para Pizza */}
          {current && normalize(current.category) === "pizza" && (
            <details className="lsf-extras" open>
              <summary className="lsf-extras__summary">
                <span className="lsf-extras__title">Extras</span>
                <span className="lsf-extras__opt">(opcional)</span>
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

          {/* Botón Add: no deshabilitar; aplica shake en error */}
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
                if (onConfirmCart) {
                  if (!storeId) return alert("Select store");
                  onConfirmCart({
                    storeId: Number(storeId),
                    items: cart.map(c => ({
                      pizzaId: c.pizzaId,
                      name: c.name,      // fallback para el backend (name→id)
                      size: c.size,
                      qty: c.qty,
                      price: c.price,
                      extras: c.extras,
                    })),
                    total,
                  });
                  return;
                }
                try {
                  const payload = {
                    storeId,
                    type: forcedStoreId ? "DELIVERY" : "LOCAL",
                    delivery: forcedStoreId ? "COURIER" : "PICKUP",
                    products: cart.map((c) => ({
                      pizzaId: c.pizzaId,
                      size: c.size,
                      qty: c.qty,
                      price: c.price,
                      extras: c.extras,
                    })),
                    totalProducts: total,
                    discounts: 0,
                    total,
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
