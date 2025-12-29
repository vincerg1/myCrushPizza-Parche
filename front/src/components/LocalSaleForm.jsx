// ──────────────────────────────────────────────────────────────
// LocalSaleForm – Mobile-first TPV UI (tabs + product grid + bottom bar + modals)
//  ✅ Reusa tu lógica de precios, extras (1º gratis), carrito y confirmación.
//  ✅ Cambia SOLO la UI/UX.
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

/* Modal simple (portal) */
function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="lsf-modal" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="lsf-modal__panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="lsf-modal__head">
          <div className="lsf-modal__title">{title}</div>
          <button type="button" className="lsf-iconbtn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="lsf-modal__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/* ───────── Helpers ───────── */
const parseMaybeJSON = (v, fallback) => {
  try {
    return typeof v === "string" ? JSON.parse(v) : v ?? fallback;
  } catch {
    return fallback;
  }
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
  pizzaId: row.pizzaId ?? row.id,
  name: row.name,
  category: row.category,
  selectSize: parseMaybeJSON(row.selectSize, []) || [],
  priceBySize: parseMaybeJSON(row.priceBySize, {}) || {},
  stock: row.stock ?? null,
  image: row.image ?? null, // por si lo tienes ya
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
  const [menu, setMenu] = useState([]); // incluye Extras
  const [cat, setCat] = useState("Pizza");
  const [cart, setCart] = useState([]);
  const [sel, setSel] = useState({ pizzaId: "", size: "", qty: 1, extras: {} });
  const [toast, setToast] = useState(null);

  // UI state (solo UI)
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  // errores visuales
  const [errors, setErrors] = useState({ item: false, size: false });
  const [triedAdd, setTriedAdd] = useState(false);
  const [shakeAdd, setShakeAdd] = useState(false);
  const MAX_QTY_SELECT = 12;

  /* effects */
  useEffect(() => {
    if (forcedStoreId) return;
    if (isAdmin) {
      api.get("/api/stores").then((r) => setStores(r.data)).catch(() => setStores([]));
    } else if (auth?.storeId) {
      setStoreId(auth.storeId);
    }
  }, [forcedStoreId, isAdmin, auth?.storeId]);

  useEffect(() => {
    if (!storeId) return;
    api
      .get(`/api/menuDisponible/${storeId}`)
      .then((r) => {
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
    if (sel.pizzaId) setErrors((e) => ({ ...e, item: false }));
    setTriedAdd(false);
  }, [sel.pizzaId]);

  useEffect(() => {
    if (sel.size) setErrors((e) => ({ ...e, size: false }));
    setTriedAdd(false);
  }, [sel.size]);

  /* memo/selectores */
  const itemsAvail = useMemo(
    () => menu.filter((m) => normalize(m.category) === normalize(cat) && (m.stock == null || m.stock > 0)),
    [menu, cat]
  );

  // Extras (category='Extras')
  const extrasAvail = useMemo(
    () => menu.filter((m) => normalize(m.category) === "extras" && (m.stock == null || m.stock > 0)),
    [menu]
  );

  const current = menu.find((m) => m.pizzaId === Number(sel.pizzaId));

  // auto-select producto si no hay seleccionado (para acelerar)
  useEffect(() => {
    if (sel.pizzaId) return;
    if (!itemsAvail.length) return;
    const def = itemsAvail[0];
    setSel((s) => ({ ...s, pizzaId: String(def.pizzaId), size: "", extras: {} }));
  }, [itemsAvail, sel.pizzaId]);

  /* Auto-select size si solo hay uno */
  useEffect(() => {
    const sizes = (current?.selectSize || []).filter(Boolean);
    setSel((s) => {
      if (!current) return s.size ? { ...s, size: "" } : s;
      if (sizes.length === 1 && s.size !== sizes[0]) return { ...s, size: sizes[0] };
      if (s.size && !sizes.includes(s.size)) return { ...s, size: "" };
      return s;
    });
  }, [current]);

  const baseUnitPrice = current && sel.size ? priceForSize(current.priceBySize, sel.size) : 0;

  const extrasUnitTotal = useMemo(() => {
    const selectedPrices = extrasAvail
      .filter((ex) => !!sel.extras[ex.pizzaId])
      .map((ex) => priceForSize(ex.priceBySize, sel.size || "M"));

    if (selectedPrices.length === 0) return 0;
    const sum = selectedPrices.reduce((s, p) => s + (Number(p) || 0), 0);
    return Math.max(0, sum - (Number(selectedPrices[0]) || 0)); // 1º gratis
  }, [sel.extras, sel.size, extrasAvail]);

  const linePreview = (baseUnitPrice + extrasUnitTotal) * Number(sel.qty || 1);

  /* qty según stock/tope */
  const qtyOptions = useMemo(() => {
    const hardMax = MAX_QTY_SELECT;
    const stockMax = current?.stock == null ? hardMax : Number(current.stock);
    const n = Math.max(1, Math.min(hardMax, stockMax));
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [current?.stock]);

  useEffect(() => {
    const max = qtyOptions[qtyOptions.length - 1] || 1;
    setSel((s) => ({ ...s, qty: Math.min(Math.max(1, Number(s.qty || 1)), max) }));
  }, [qtyOptions]);

  /* handlers */
  const toggleExtra = (id) =>
    setSel((s) => ({ ...s, extras: { ...s.extras, [id]: !s.extras[id] } }));

  const pickProduct = (pizzaId) => {
    setSel((s) => ({
      ...s,
      pizzaId: String(pizzaId),
      size: "",
      qty: 1,
      extras: {},
    }));
  };

  const pickSize = (sz) => setSel((s) => ({ ...s, size: sz }));

  const decQty = () =>
    setSel((s) => ({ ...s, qty: Math.max(1, Number(s.qty || 1) - 1) }));

  const incQty = () => {
    const max = qtyOptions[qtyOptions.length - 1] || 1;
    setSel((s) => ({ ...s, qty: Math.min(max, Number(s.qty || 1) + 1) }));
  };

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

    const chosenIds = extrasAvail.filter((x) => sel.extras[x.pizzaId]).map((x) => String(x.pizzaId));
    let chosenExtras = chosenIds
      .map((idStr) => {
        const ex = extrasAvail.find((x) => x.pizzaId === Number(idStr));
        return ex
          ? { id: ex.pizzaId, name: ex.name, price: priceForSize(ex.priceBySize, sel.size || "M") }
          : null;
      })
      .filter(Boolean);

    if (chosenExtras.length > 0) chosenExtras = [{ ...chosenExtras[0], price: 0 }, ...chosenExtras.slice(1)];
    const extrasPerUnit = chosenExtras.reduce((a, b) => a + num(b.price), 0);
    const subtotal = (price + extrasPerUnit) * sel.qty;

    setCart((c) => [
      ...c,
      {
        pizzaId: current.pizzaId,
        name: current.name,
        category: current.category,
        size: sel.size,
        qty: sel.qty,
        price,
        extras: chosenExtras,
        subtotal,
      },
    ]);

    setSel({ pizzaId: "", size: "", qty: 1, extras: {} });
    setTriedAdd(false);
    setExtrasOpen(false);
    setCartOpen(true); // feedback rápido: abre carrito
  };

  const total = cart.reduce((t, l) => t + l.subtotal, 0);
  const cartCount = cart.reduce((n, l) => n + Number(l.qty || 0), 0);

  if (!storeId && !isAdmin && !forcedStoreId) return <p className="msg">Select store…</p>;

  // Imagen: si no hay, placeholder (CSS)
  const getImg = (it) => it?.image || "";

  /* UI */
  return (
    <>
      <div className={compact ? "lsf-wrapper compact lsf-mobile" : "lsf-wrapper lsf-mobile"}>
        {/* Header */}
        <div className="lsf-top">
          <div className="lsf-top__title">
            {compact ? "Selecciona productos" : "Local sale"}
          </div>

          {/* botón carrito */}
          <button
            type="button"
            className="lsf-cartbtn"
            onClick={() => setCartOpen(true)}
            aria-label="Abrir carrito"
          >
            🛒 <span className="lsf-cartbtn__count">{cartCount}</span>
            <span className="lsf-cartbtn__total">€{total.toFixed(2)}</span>
          </button>
        </div>

        {/* selector tienda (solo admin y no forced) */}
        {!forcedStoreId && isAdmin && (
          <div className="lsf-store">
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

        {/* Tabs categorías */}
        <div className="lsf-tabs" role="tablist" aria-label="Categorías">
          {categories.map((c) => {
            const active = normalize(cat) === normalize(c);
            return (
              <button
                key={c}
                type="button"
                className={`lsf-tab ${active ? "is-active" : ""}`}
                onClick={() => setCat(c)}
                role="tab"
                aria-selected={active}
              >
                {displayCategory(c)}
              </button>
            );
          })}
        </div>

        {/* Grid productos */}
        <div className="lsf-grid" role="list">
          {itemsAvail.map((it) => {
            const active = Number(sel.pizzaId) === Number(it.pizzaId);
            const from = priceForSize(it.priceBySize, (it.selectSize?.[0] || "M") ?? "M");
            const img = getImg(it);
            return (
              <button
                key={it.pizzaId}
                type="button"
                className={`lsf-card ${active ? "is-active" : ""}`}
                onClick={() => pickProduct(it.pizzaId)}
                role="listitem"
              >
                <div className={`lsf-card__img ${img ? "" : "is-placeholder"}`}>
                  {img ? <img src={img} alt={it.name} /> : <span>🍕</span>}
                </div>
                <div className="lsf-card__meta">
                  <div className="lsf-card__name">{it.name}</div>
                  <div className="lsf-card__sub">Desde €{from.toFixed(2)}</div>
                </div>
              </button>
            );
          })}
          {!itemsAvail.length && <div className="lsf-empty">No hay items disponibles.</div>}
        </div>

        {/* Barra inferior fija (editor rápido) */}
        <div className="lsf-bottom">
          <div className="lsf-bottom__row">
            {/* Producto seleccionado */}
            <div className={`lsf-pill ${triedAdd && errors.item ? "is-error" : ""}`}>
              {current ? current.name : "Elige un producto"}
            </div>

            {/* Qty stepper */}
            <div className="lsf-qty">
              <button type="button" className="lsf-qty__btn" onClick={decQty} disabled={!current || sel.qty <= 1}>
                –
              </button>
              <div className="lsf-qty__val">{sel.qty}</div>
              <button
                type="button"
                className="lsf-qty__btn"
                onClick={incQty}
                disabled={!current || sel.qty >= (qtyOptions[qtyOptions.length - 1] || 1)}
              >
                +
              </button>
            </div>
          </div>

          {/* Size chips */}
          <div className={`lsf-sizes ${triedAdd && errors.size ? "is-error" : ""}`}>
            {(current?.selectSize || []).map((sz) => {
              const active = sel.size === sz;
              const p = priceForSize(current?.priceBySize, sz);
              return (
                <button
                  key={sz}
                  type="button"
                  className={`lsf-chip ${active ? "is-active" : ""}`}
                  onClick={() => pickSize(sz)}
                  disabled={!current}
                >
                  <span className="lsf-chip__sz">{sz}</span>
                  <span className="lsf-chip__pr">€{p.toFixed(2)}</span>
                </button>
              );
            })}
          </div>

          <div className="lsf-bottom__actions">
            <button
              type="button"
              className="lsf-btn lsf-btn--ghost"
              onClick={() => setExtrasOpen(true)}
              disabled={!current || normalize(current?.category) !== "pizza"}
              title="Extras (1º gratis)"
            >
              Extras <span className="lsf-badge">1º gratis</span>
            </button>

            <button
              type="button"
              className={`lsf-btn lsf-btn--primary ${
                triedAdd && (errors.item || errors.size) && shakeAdd ? "is-error pc-shake" : ""
              }`}
              onClick={addLine}
              disabled={!current}
            >
              Add • {current && sel.size ? `€${linePreview.toFixed(2)}` : "—"}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL EXTRAS */}
      <Modal
        open={extrasOpen}
        title="Extras (1º gratis)"
        onClose={() => setExtrasOpen(false)}
      >
        {!current || normalize(current?.category) !== "pizza" ? (
          <div className="lsf-muted">Los extras solo aplican a pizzas.</div>
        ) : extrasAvail.length === 0 ? (
          <div className="lsf-muted">No hay extras disponibles.</div>
        ) : (
          <>
            <div className="lsf-extrasbar">
              <div className="lsf-muted">
                Selecciona extras. El primero seleccionado queda a <b>€0</b>.
              </div>
              <div className="lsf-muted">
                Extras por unidad: <b>€{extrasUnitTotal.toFixed(2)}</b>
              </div>
            </div>

            <div className="lsf-extraslist">
              {extrasAvail.map((ex) => {
                const checked = !!sel.extras[ex.pizzaId];
                const p = priceForSize(ex.priceBySize, sel.size || "M");
                return (
                  <label key={ex.pizzaId} className="lsf-extrasitem">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleExtra(ex.pizzaId)}
                    />
                    <span className="lsf-extrasitem__name">{ex.name}</span>
                    <span className="lsf-extrasitem__price">+€{p.toFixed(2)}</span>
                  </label>
                );
              })}
            </div>

            <div className="lsf-modal__foot">
              <button type="button" className="lsf-btn lsf-btn--ghost" onClick={() => setExtrasOpen(false)}>
                Listo
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* MODAL CARRITO */}
      <Modal open={cartOpen} title={`Carrito • €${total.toFixed(2)}`} onClose={() => setCartOpen(false)}>
        {cart.length === 0 ? (
          <div className="lsf-muted">Carrito vacío.</div>
        ) : (
          <>
            <div className="lsf-cartlist">
              {cart.map((l, i) => (
                <div key={i} className="lsf-cartrow">
                  <div className="lsf-cartrow__main">
                    <div className="lsf-cartrow__name">
                      {l.name} <span className="lsf-cartrow__meta">({l.size} × {l.qty})</span>
                    </div>
                    {l.extras?.length ? (
                      <div className="lsf-cartrow__extras">
                        + {l.extras.map((e) => e.name).join(", ")}
                      </div>
                    ) : null}
                  </div>
                  <div className="lsf-cartrow__right">
                    <div className="lsf-cartrow__price">€{l.subtotal.toFixed(2)}</div>
                    <button
                      type="button"
                      className="lsf-iconbtn"
                      onClick={() => setCart((c) => c.filter((_, idx) => idx !== i))}
                      aria-label="Eliminar línea"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="lsf-cartfoot">
              <div className="lsf-cartfoot__total">Total: €{total.toFixed(2)}</div>

              <button
                type="button"
                className="lsf-btn lsf-btn--primary"
                onClick={async () => {
                  const extrasArrayForItem = (line) =>
                    (line.extras || []).map((e) => ({
                      id: e.id,
                      code: "EXTRA",
                      label: e.name,
                      amount: Number(e.price) || 0,
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
                        price: c.price,
                        subtotal: c.subtotal,
                        extras: extrasArrayForItem(c),
                        extrasMap: extrasMapForItem(c),
                      })),
                      total,
                    });
                    return;
                  }

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
                        price: c.price,
                        extras: extrasArrayForItem(c),
                      })),
                      totalProducts: cart.reduce((t, l) => t + Number(l.price || 0) * Number(l.qty || 1), 0),
                      discounts: 0,
                      total,
                      extras: aggregatedExtras,
                    };
                    if (customer?.phone?.trim()) payload.customer = customer;

                    await api.post("/api/sales", payload);
                    setToast("Sale saved ✓");
                    setCart([]);
                    setCartOpen(false);
                    setTimeout(() => onDone(), 1200);
                  } catch (e) {
                    console.error(e);
                    alert(e.response?.data?.error || "Error");
                  }
                }}
              >
                {onConfirmCart ? "Confirmar carrito" : "Confirm sale"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Toast msg={toast} onClose={() => setToast(null)} />
    </>
  );
}
