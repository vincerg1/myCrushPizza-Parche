// LocalSaleForm.jsx (versión completa basada en tu estado actual)
// - Tabs SIN "extras" (extras solo en Product Modal)
// - Botón "+" en card abre modal centrado
// - Al añadir al carrito: el "+" del card pasa a "✔️" si ese producto ya está en carrito
// - Modal: imagen + descripción + qty + sizes + checklist de extras + precio dinámico
// - SIN “primer extra gratis” (extras suman normal)
// - Mantiene Modal de carrito accesible desde el botón 🛒 del header

import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import api from "../setupAxios";
import { useAuth } from "./AuthContext";
import "../styles/LocalSaleForm.css";

const normalize = (c) => String(c || "").trim().toLowerCase();

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
function Modal({ open, title, onClose, children, className = "" }) {
  if (!open) return null;
  return ReactDOM.createPortal(
    <div
      className={`lsf-modal ${className}`}
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
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
  ingredients: parseMaybeJSON(row.ingredients, []) || [],
  stock: row.stock ?? null,
  image: row.image ?? null,
  description: row.description ?? row.desc ?? row.shortDescription ?? "",
  available: row.available,
  type: row.type,
  isExtra: row.isExtra,
});

const capWords = (s = "") =>
  String(s)
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");

const displayCategory = (c) => capWords(String(c || ""));
const joinWithY = (arr = []) => {
  const clean = arr.filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} y ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} y ${clean[clean.length - 1]}`;
};
const ingredientsForSize = (item, size = "") => {
  const raw = item?.ingredients;
  const list = parseMaybeJSON(raw, []);
  if (!Array.isArray(list)) return [];

  return list
    .map((r) => capWords(r?.name || ""))
    .filter(Boolean);
};
const seededPick = (seed, arr) => {
  if (!arr.length) return "";
  const n = Math.abs(Number(seed) || 1);
  return arr[n % arr.length];
};

const CRUSH_TITLES = [
  "Tu crush más salvaje",
  "Tu crush irresistible",
  "Tu crush sin filtro",
  "Tu crush de verdad",
  "Tu crush más hot",
];
const CRUSH_HOOKS = ["Un flechazo.", "Exquisita.", "Atrevida.", "Brutal.", "Wow."];
const CRUSH_CLOSERS = [
  "First taste, first love.",
  "Sabor que no se olvida.",
  "Te mira… y caes.",
  "Una mordida y listo.",
  "Crush confirmado en 10 segundos.",
  "Te enamora sin avisar.",
];

const buildAutoDescription = (item) => {
  const ings = Array.isArray(item?.ingredients)
    ? item.ingredients.map((i) => i.name).filter(Boolean)
    : [];

  const lineA = ings.length
    ? `${joinWithY(ings)}.`
    : "Ingredientes seleccionados a mano.";

  const title = seededPick(item?.pizzaId, CRUSH_TITLES);
  const hook = seededPick(item?.pizzaId + 7, CRUSH_HOOKS);
  const close = seededPick(item?.pizzaId + 13, CRUSH_CLOSERS);

  return { lineA, title, hook, close };
};

function getPizzaBadge(it) {
  const seed = Number(it.pizzaId) || 1;

  const BADGES = [
    {
      icon: "⭐",
      metric: "Top ventas",
      closer: "La piden y repiten",
    },
    {
      icon: "🔥",
      metric: "La más pedida",
      closer: "En pedidos desde apertura",
    },
    {
      icon: "❤️",
      metric: "Favorita de clientes",
      closer: "9 de cada 10 repiten",
    },
    {
      icon: "⚡",
      metric: "Trending hoy",
      closer: "Popular en tu zona",
    },
  ];

  const badge = BADGES[seed % BADGES.length];

  return {
    hook: seededPick(seed + 7, CRUSH_HOOKS), // 👈 solo UNO
    icon: badge.icon,
    metric: badge.metric,
    closer: badge.closer,
  };
}




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
  const [menu, setMenu] = useState([]);
  const [cat, setCat] = useState("");
  const [cart, setCart] = useState([]);
  const [sel, setSel] = useState({ pizzaId: "", size: "", qty: 1, extras: {} });
  const [toast, setToast] = useState(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [flippedId, setFlippedId] = useState(null);

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

  // Extras: SOLO por category === "extras" (o flags opcionales)
  const isExtraItem = (m) => {
    if (m?.isExtra === true) return true;
    if (normalize(m?.type) === "extra") return true;
    return normalize(m?.category) === "extras";
  };

  const categories = useMemo(() => {
    const set = new Map();
    for (const m of menu) {
      if (!m?.category) continue;
      if (isExtraItem(m)) continue; // ✅ extras NO en tabs
      const key = normalize(m.category);
      if (!key) continue;
      if (!set.has(key)) set.set(key, m.category);
    }
    return Array.from(set.values()).sort((a, b) => String(a).localeCompare(String(b), "es"));
  }, [menu]);

  useEffect(() => {
    if (!categories.length) {
      if (cat) setCat("");
      return;
    }
    const catExists = categories.some((c) => normalize(c) === normalize(cat));
    if (!cat || !catExists) setCat(categories[0]);
  }, [categories, cat]);

const itemsAvail = useMemo(() => {
  if (!cat) return [];

  // 1) filtra por categoría (sin extras)
  const filtered = menu.filter(
    (m) => !isExtraItem(m) && normalize(m.category) === normalize(cat)
  );

  // 2) ordena por precio (mayor → menor)
  return [...filtered].sort((a, b) => {
    const pa = priceForSize(a.priceBySize, a.selectSize?.[0] || "M");
    const pb = priceForSize(b.priceBySize, b.selectSize?.[0] || "M");
    return pb - pa;
  });
}, [menu, cat]);

  const extrasAvail = useMemo(() => menu.filter((m) => isExtraItem(m)), [menu]);

  const current = menu.find((m) => m.pizzaId === Number(sel.pizzaId));

  /* Auto-select size si solo hay uno */
  useEffect(() => {
    const sizes = (current?.selectSize || []).filter(Boolean);
    setSel((s) => {
      if (!current) return s;
      if (sizes.length === 1 && s.size !== sizes[0]) return { ...s, size: sizes[0] };
      if (s.size && !sizes.includes(s.size)) return { ...s, size: "" };
      return s;
    });
  }, [current]);

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
  const toggleExtra = (id) => setSel((s) => ({ ...s, extras: { ...s.extras, [id]: !s.extras[id] } }));

  const openProductModal = (pizzaId) => {
    setSel({ pizzaId: String(pizzaId), size: "", qty: 1, extras: {} });
    setProductModalOpen(true);
  };

  const pickSize = (sz) => setSel((s) => ({ ...s, size: sz }));
  const decQty = () => setSel((s) => ({ ...s, qty: Math.max(1, Number(s.qty || 1) - 1) }));
  const incQty = () => {
    const max = qtyOptions[qtyOptions.length - 1] || 1;
    setSel((s) => ({ ...s, qty: Math.min(max, Number(s.qty || 1) + 1) }));
  };

  const toggleFlip = (id) => setFlippedId((prev) => (prev === id ? null : id));

  const baseUnitPrice = current && sel.size ? priceForSize(current.priceBySize, sel.size) : 0;

  // ✅ NUEVO: extras suman normal (sin gratis)
  const extrasUnitTotal = useMemo(() => {
    const selected = extrasAvail.filter((ex) => !!sel.extras[ex.pizzaId]);
    if (!selected.length) return 0;
    return selected.reduce((sum, ex) => sum + priceForSize(ex.priceBySize, sel.size || "M"), 0);
  }, [sel.extras, sel.size, extrasAvail]);

  const addLine = () => {
    if (!current) return;

    if (!sel.size) {
      alert("Selecc Size");
      return;
    }

    if (current.stock != null && current.stock < sel.qty) {
      alert("Not enough stock");
      return;
    }

    const chosenExtras = extrasAvail
      .filter((x) => sel.extras[x.pizzaId])
      .map((ex) => ({
        id: ex.pizzaId,
        name: ex.name,
        price: priceForSize(ex.priceBySize, sel.size || "M"),
      }));

    const extrasPerUnit = chosenExtras.reduce((a, b) => a + num(b.price), 0);
    const subtotal = (baseUnitPrice + extrasPerUnit) * sel.qty;

    setCart((c) => [
      ...c,
      {
        pizzaId: current.pizzaId,
        name: current.name,
        category: current.category,
        size: sel.size,
        qty: sel.qty,
        price: baseUnitPrice,
        extras: chosenExtras,
        subtotal,
      },
    ]);

    setToast("Añadido al carrito");
  };

  const total = cart.reduce((t, l) => t + l.subtotal, 0);
  const cartCount = cart.reduce((n, l) => n + Number(l.qty || 0), 0);

  if (!storeId && !isAdmin && !forcedStoreId) return <p className="msg">Select store…</p>;

  const getImg = (it) => it?.image || "";

const modalUnit = baseUnitPrice + extrasUnitTotal;
const modalTotal = modalUnit * Number(sel.qty || 1);
const modalReady = !!current && !!sel.size;

  return (
    <>
      <div className={compact ? "lsf-wrapper compact lsf-mobile" : "lsf-wrapper lsf-mobile"}>
        {/* Header */}
        <div className="lsf-top">
          <div className="lsf-top__title">{compact ? "Selecciona productos" : "Local sale"}</div>

          <button type="button" className="lsf-cartbtn" onClick={() => setCartOpen(true)} aria-label="Abrir carrito">
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

        {/* Tabs categorías (reales, derivadas del menú) */}
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

        {/* Grid productos (flip SOLO info; compra SOLO con "+") */}
        <div className="lsf-grid" role="list">
          {itemsAvail.map((it) => {
            const img = getImg(it);
            const flipped = flippedId === it.pizzaId;

            const basePrice = priceForSize(it.priceBySize, it.selectSize?.[0] || "M");

            const alreadyInCart = cart.some((l) => Number(l.pizzaId) === Number(it.pizzaId));

            return (
              <div
                key={it.pizzaId}
                className={`lsf-card lsf-flip ${flipped ? "is-flipped" : ""}`}
                onClick={() => toggleFlip(it.pizzaId)}
                role="listitem"
              >
                <div className="lsf-flip__inner">
                  {/* FRONT */}
                  <div className="lsf-flip__front">
                    <div className="lsf-card__image">
                      {img ? <img src={img} alt={it.name} /> : <div className="lsf-card__img is-placeholder"><span>🍕</span></div>}
                    </div>

                    <button
                      type="button"
                      className={`lsf-card__addbtn ${alreadyInCart ? "is-added" : ""}`}
               onClick={(e) => {
                    e.stopPropagation();
                    setSel({
                      pizzaId: String(it.pizzaId),
                      size: it.selectSize?.length === 1 ? it.selectSize[0] : "",
                      qty: 1,
                      extras: {},
                    });
                    setProductModalOpen(true);
                  }}
                      aria-label={`Añadir ${it.name}`}
                    >
                      {alreadyInCart ? "✔️" : "+add"}
                    </button>

                    <div className="lsf-card__overlay">
                      <div className="lsf-card__name">{it.name}</div>
                      <div className="lsf-card__price">€{basePrice.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* BACK (INFO ONLY) */}
                <div className="lsf-flip__back">
                  {(() => {
                    const badge = getPizzaBadge(it);
                    return (
                      <div className="lsf-back__badge">
                        {/* HOOK */}
                        <div className="lsf-badge__hook">
                          {badge.icon} {badge.hook}
                        </div>

                        {/* MÉTRICA */}
                        <div className="lsf-badge__metric">
                          {badge.metric}
                        </div>

                        {/* CLOSER */}
                        <div className="lsf-badge__closer">
                          {badge.closer}
                        </div>
                      </div>
                    );
                  })()}
                </div>
                </div>
              </div>
            );
          })}

          {!itemsAvail.length && <div className="lsf-empty">No hay items disponibles.</div>}
        </div>
      </div>
      {cart.length > 0 && (
        <div className="lsf-sticky">
          

          <button
            type="button"
            className="lsf-sticky__btn"
            onClick={() => {
              if (!onConfirmCart) return;
              if (!storeId) return alert("Select store");

              const extrasArrayForItem = (line) =>
                (line.extras || []).map((e) => ({
                  id: e.id,
                  code: "EXTRA",
                  label: e.name,
                  amount: Number(e.price) || 0,
                }));

              const extrasMapForItem = (line) =>
                Object.fromEntries((line.extras || []).map((e) => [e.id, true]));

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
            }}
          >
            PAY NOW
          </button>
        </div>
      )}



      {/* PRODUCT MODAL (centrado) */}
      <Modal
        open={productModalOpen}
        title={current?.name || "Producto"}
        onClose={() => setProductModalOpen(false)}
        className="lsf-modal--center"
      >
        {!current ? null : (
          <>
            <div className="lsf-pm">
              <div className="lsf-pm__hero">
                {current.image ? <img src={current.image} alt={current.name} /> : <div className="lsf-pm__ph">🍕</div>}
              </div>

       <div className="lsf-pm__desc">
          {(() => {
            const ingredients =
              Array.isArray(current.ingredients) && current.ingredients.length
                ? current.ingredients.map((i) => i.name)
                : [];

            return (
          <div className="lsf-muted">
            <div><b>Tu crush sin filtro</b></div>

            {ingredients.length > 0 ? (
              <div>
                Elaborada con {ingredients.join(", ")}.
              </div>
            ) : (
              <div>
                Ingredientes seleccionados a mano.
              </div>
            )}

            {/* ⚠️ Aviso alérgenos */}
            <div className="lsf-allergen">
              ⚠️ Puede contener alérgenos. Consulta con nuestro personal si tienes alguna alergia.
            </div>
          </div>
            );
          })()}
        </div>



              {/* QTY */}
              <div className="lsf-pm__row">
                <div className="lsf-pm__label">Qty</div>
                <div className="lsf-qty">
                  <button type="button" className="lsf-qty__btn" onClick={decQty} disabled={sel.qty <= 1}>
                    –
                  </button>
                  <div className="lsf-qty__val">{sel.qty}</div>
                  <button
                    type="button"
                    className="lsf-qty__btn"
                    onClick={incQty}
                    disabled={sel.qty >= (qtyOptions[qtyOptions.length - 1] || 1)}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* SIZES */}
              <div className="lsf-pm__row">
                <div className="lsf-pm__label">Size</div>
                <div className="lsf-sizes">
                  {(current.selectSize || []).map((sz) => {
                    const a = sel.size === sz;
                    const p = priceForSize(current.priceBySize, sz);
                    return (
                      <button
                        key={sz}
                        type="button"
                        className={`lsf-chip ${a ? "is-active" : ""}`}
                        onClick={() => pickSize(sz)}
                      >
                        <span className="lsf-chip__sz">{sz}</span>
                        <span className="lsf-chip__pr">€{p.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* EXTRAS */}
              <div className="lsf-pm__row">
                <div className="lsf-pm__label">Extras</div>
                {extrasAvail.length === 0 ? (
                  <div className="lsf-muted">No hay extras.</div>
                ) : (
                <div className="lsf-extraslist">
                  {[...extrasAvail]
                    .sort((a, b) => {
                      const pa = priceForSize(
                        a.priceBySize,
                        sel.size || current.selectSize?.[0] || "M"
                      );
                      const pb = priceForSize(
                        b.priceBySize,
                        sel.size || current.selectSize?.[0] || "M"
                      );
                      return pb - pa; // de más caro a más barato
                    })
                    .map((ex) => {
                      const checked = !!sel.extras[ex.pizzaId];
                      const p = priceForSize(
                        ex.priceBySize,
                        sel.size || current.selectSize?.[0] || "M"
                      );

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

                )}
              </div>

              {/* ACTIONS */}
              <div className="lsf-pm__actions">
                <button
                  type="button"
                  className="lsf-btn lsf-btn--ghost"
                  onClick={() => setProductModalOpen(false)}
                >
                  Continue
                </button>

              <button
                type="button"
                className="lsf-btn lsf-btn--primary"
                disabled={!modalReady}
                onClick={() => {
                  addLine();
                  setProductModalOpen(false);
                }}
              >
                {modalReady ? `Add to cart · €${modalTotal.toFixed(2)}` : "Selec Size"}
              </button>
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* CART MODAL */}
      <Modal open={cartOpen} title={`Carrito • €${total.toFixed(2)}`} onClose={() => setCartOpen(false)} className="lsf-modal--center">
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
                    {l.extras?.length ? <div className="lsf-cartrow__extras">+ {l.extras.map((e) => e.name).join(", ")}</div> : null}
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
                    setTimeout(() => onDone(), 600);
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
