// ──────────────────────────────────────────────────────────────
// LocalSaleForm – modo normal y modo “compact + forcedStoreId”
//  • NUEVO: onConfirmCart (opcional) → devuelve carrito sin guardar
// ──────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import api from "../setupAxios";
import { useAuth } from "./AuthContext";
import "../styles/LocalSaleForm.css";

const categories = ["Pizza", "Extras", "Sides", "Drinks", "Desserts"];
const normalize = (c) => (c || "Pizza").trim().toLowerCase();

/* ────────────── Toast vía portal ────────────── */
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

export default function LocalSaleForm({
  forcedStoreId = null,
  compact = false,
  customer = null,
  onDone = () => {},
  /** Nuevo: si se pasa, NO guarda en /api/sales.
   *  En su lugar llama onConfirmCart({ storeId, items, total })
   */
  onConfirmCart = null,
}) {
  const { auth } = useAuth();
  const isAdmin  = auth?.role === "admin";

  /* ─────────── state ─────────── */
  const [storeId, setStoreId] = useState(forcedStoreId);
  const [stores, setStores] = useState([]);
  const [stock, setStock] = useState([]);
  const [cat, setCat] = useState("Pizza");
  const [cart, setCart] = useState([]);
  const [sel, setSel] = useState({ pizzaId: "", size: "", qty: 1 });
  const [toast, setToast] = useState(null);
  const [errors, setErrors] = useState({ item: false, size: false });

  /* ─────────── effects ─────────── */
useEffect(() => {
  // En público usamos 'forcedStoreId' → no tocar storeId aquí
  if (forcedStoreId) return;

  if (isAdmin) {
    api
      .get("/api/stores")
      .then((r) => setStores(r.data))
      .catch(() => setStores([]));
  } else {
    // Si hay sesión de tienda, tomamos su storeId; si no, lo dejamos vacío (público)
    if (auth?.storeId) setStoreId(auth.storeId);
  }
}, [forcedStoreId, isAdmin, auth?.storeId]);

  useEffect(() => {
    if (!storeId) return;
    api
      .get(`/api/menuDisponible/${storeId}`, { params: { category: cat } })
      .then((r) => setStock(Array.isArray(r.data) ? r.data : []))
      .catch(() => setStock([]));
  }, [storeId, cat]);

  useEffect(() => {
    if (sel.pizzaId) setErrors((e) => ({ ...e, item: false }));
  }, [sel.pizzaId]);
  useEffect(() => {
    if (sel.size) setErrors((e) => ({ ...e, size: false }));
  }, [sel.size]);

  /* helpers */
  const itemsAvail = useMemo(
    () =>
      stock.filter(
        (s) => normalize(s.category) === normalize(cat) && s.stock > 0
      ),
    [stock, cat]
  );
  const current = stock.find((s) => s.pizzaId === Number(sel.pizzaId));

  const addLine = () => {
    if (!current || !sel.size) {
      setErrors({
        item: !current,
        size: !sel.size,
      });
      return;
    }
    const price = current.priceBySize[sel.size];
    if (price == null) return alert("Price not set");
    if (current.stock < sel.qty) return alert("Not enough stock");

    setCart((c) => [
      ...c,
      {
        pizzaId: current.pizzaId,
        name: current.name,
        category: current.category,
        size: sel.size,
        qty: sel.qty,
        price,
        subtotal: price * sel.qty,
      },
    ]);
    setSel({ pizzaId: "", size: "", qty: 1 });
  };

  const total = cart.reduce((t, l) => t + l.subtotal, 0);

  if (!storeId && !isAdmin && !forcedStoreId)
    return <p className="msg">Select store…</p>;

  /* ─────────── UI ─────────── */
  return (
    <>
      <div className={compact ? "lsf-wrapper compact" : "lsf-wrapper"}>
        {compact ? (
        <>
          <h3 className="pc-subtitle">Selecciona de la lista</h3>
          <p className="pc-note">
            Elige una <b>categoría</b> (Pizzas, Bebidas…), luego el <b>item</b>,
            <b> tamaño</b> y <b>cantidad</b>. Pulsa <b>Add</b>.
          </p>
        </>
      ) : (
        <h3>Local sale</h3>
      )}{!compact && <h3>Local sale</h3>}

        {/* selector tienda */}
        {!forcedStoreId && isAdmin && (
          <div className="row">
            {!compact && <label className="lbl">Store:</label>}
            <select
              value={storeId || ""}
              onChange={(e) => setStoreId(Number(e.target.value))}
            >
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

        {/* línea alta */}
        <div className="line">
          <select
            className={errors.item ? "error" : ""}
            value={sel.pizzaId}
            onChange={(e) =>
              setSel({ ...sel, pizzaId: e.target.value, size: "" })
            }
          >
            <option value="">– item –</option>
            {itemsAvail.map((it) => (
              <option key={it.pizzaId} value={it.pizzaId}>
                {it.name} ({it.stock})
              </option>
            ))}
          </select>

          <select
            className={errors.size ? "error" : ""}
            value={sel.size}
            disabled={!current}
            onChange={(e) => setSel({ ...sel, size: e.target.value })}
          >
            <option value="">size</option>
            {current?.selectSize.map((sz) => (
              <option key={sz} value={sz}>
                {sz} €{current.priceBySize[sz] ?? "?"}
              </option>
            ))}
          </select>

          <input
            type="number"
            min="1"
            value={sel.qty}
            onChange={(e) =>
              setSel({ ...sel, qty: Math.max(1, Number(e.target.value || 1)) })
            }
          />
          <button className="ADDBTN" onClick={addLine}>
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
                        onClick={() =>
                          setCart((c) => c.filter((_, idx) => idx !== i))
                        }
                      >
                        ✕
                      </button>
                    </td>
                    {!compact && <td>{l.category}</td>}
                    <td>{l.name}</td>
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
                // ── NUEVO: flujo “público” (no persiste aún)
                if (onConfirmCart) {
                  if (!storeId) return alert("Select store");
                  onConfirmCart({
                    storeId: Number(storeId),
                    items: cart.map((c) => ({
                      pizzaId: c.pizzaId,
                      size: c.size,
                      qty: c.qty,
                      price: c.price,
                    })),
                    total,
                  });
                  return;
                }

                // ── Flujo original (backoffice): guarda la venta
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
                    })),
                    totalProducts: total,
                    discounts: 0,
                    total,
                  };
                  if (customer?.phone?.trim()) payload.customer = customer;

                  await api.post("/api/sales", payload);

                  setToast("Sale saved ✓");
                  setCart([]);
                  setTimeout(() => {
                    onDone();
                  }, 2000);
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

      {/* Toast */}
      <Toast msg={toast} onClose={() => setToast(null)} />
    </>
  );
}
