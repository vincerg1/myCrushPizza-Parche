// ──────────────────────────────────────────────────────────────
// LocalSaleForm  – modo normal y modo “compact + forcedStoreId”
// ──────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import axios      from "axios";
import { useAuth } from "./AuthContext";
import "../styles/LocalSaleForm.css";

const categories = ["Pizza", "Extras", "Sides", "Drinks", "Desserts"];
const normalize  = c => (c || "Pizza").trim().toLowerCase();

export default function LocalSaleForm({
  forcedStoreId = null,   // nº de tienda fija (delivery)
  compact       = false,  // oculta SOLO cabecera <h3>
  customer      = null,   // info del cliente (delivery)
  onDone        = ()=>{}, // callback al guardar
}) {
  const { auth } = useAuth();
  const isAdmin  = auth.role === "admin";

  /* state */
  const [storeId, setStoreId] = useState(forcedStoreId);
  const [stores , setStores ] = useState([]);
  const [stock  , setStock  ] = useState([]);
  const [cat    , setCat    ] = useState("Pizza");
  const [cart   , setCart   ] = useState([]);
  const [sel    , setSel    ] = useState({ pizzaId:"", size:"", qty:1 });

  /* ① tiendas para admin (si no está forzado) */
  useEffect(() => {
    if (forcedStoreId) return;
    if (isAdmin) axios.get("/api/stores").then(r=>setStores(r.data));
    else         setStoreId(auth.storeId);
  }, [isAdmin, auth.storeId, forcedStoreId]);

  /* ② menú disponible */
  useEffect(() => {
    if (!storeId) return;
    axios
      .get(`/api/menuDisponible/${storeId}`, { params:{ category: cat } })
      .then(r=>setStock(r.data))
      .catch(console.error);
  }, [storeId, cat]);

  /* helpers */
  const itemsAvail = useMemo(
    () => stock.filter(s =>
      normalize(s.category) === normalize(cat) && s.stock > 0),
    [stock, cat]
  );
  const current = stock.find(s => s.pizzaId === Number(sel.pizzaId));

  const addLine = () => {
    if (!current || !sel.size) return;
    const price = current.priceBySize[sel.size];
    if (price == null)   return alert("Price not set");
    if (current.stock < sel.qty) return alert("Not enough stock");

    setCart(c => [...c,{
      pizzaId : current.pizzaId,
      name    : current.name,
      category: current.category,
      size    : sel.size,
      qty     : sel.qty,
      price,
      subtotal: price * sel.qty,
    }]);
    setSel({ pizzaId:"", size:"", qty:1 });
  };

  const total = cart.reduce((t,l)=>t+l.subtotal,0);

  if (!storeId && !isAdmin && !forcedStoreId)
    return <p className="msg">Select store…</p>;

  /* ─── UI ─── */
  return (
    <div className={compact ? "lsf-wrapper compact" : "lsf-wrapper"}>
      {!compact && <h3>Local sale</h3>}

      {/* selector tienda (oculto si viene forcedStoreId) */}
      {!forcedStoreId && isAdmin && (
        <div className="row">
          {!compact && <label className="lbl">Store:</label>}
          <select value={storeId||""} onChange={e=>setStoreId(e.target.value)}>
            <option value="">– choose store –</option>
            {stores.map(s=>(
              <option key={s.id} value={s.id}>{s.storeName}</option>
            ))}
          </select>
        </div>
      )}

      {/* selector categoría SIEMPRE visible */}
      <div className="row">
        {!compact && <label className="lbl">Category:</label>}
        <select value={cat} onChange={e=>setCat(e.target.value)}>
          {categories.map(c=> <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* línea de alta */}
      <div className="line">
        <select
          value={sel.pizzaId}
          onChange={e=>setSel({ ...sel, pizzaId:e.target.value, size:"" })}
        >
          <option value="">– item –</option>
          {itemsAvail.map(it=>(
            <option key={it.pizzaId} value={it.pizzaId}>
              {it.name} ({it.stock})
            </option>
          ))}
        </select>

        <select
          value={sel.size}
          disabled={!current}
          onChange={e=>setSel({ ...sel, size:e.target.value })}
        >
          <option value="">size</option>
          {current?.selectSize.map(sz=>(
            <option key={sz} value={sz}>
              {sz} €{current.priceBySize[sz] ?? "?"}
            </option>
          ))}
        </select>

        <input type="number" min="1"
               value={sel.qty}
               onChange={e=>setSel({ ...sel, qty:Number(e.target.value) })}/>
        <button onClick={addLine}>Add</button>
      </div>

      {cart.length>0 && (
        <>
          <table className="ing-table mini">
            <thead>
              <tr>
                <th>✕</th>
                {!compact && <th>Cat.</th>}
                <th>Item</th><th>Size</th><th>Qty</th><th>€</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((l,i)=>(
                <tr key={i}>
                  <td>
                    <button className="del-row"
                      onClick={()=>setCart(c=>c.filter((_,idx)=>idx!==i))}>✕</button>
                  </td>
                  {!compact && <td>{l.category}</td>}
                  <td>{l.name}</td><td>{l.size}</td>
                  <td>{l.qty}</td><td>{l.subtotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="total">Total: €{total.toFixed(2)}</p>

        <button
          className="btn-confirm"
          onClick={async () => {
            try {
              /* ── construimos el payload ─────────────── */
              const payload = {
                storeId,
                type     : forcedStoreId ? "DELIVERY" : "LOCAL",
                delivery : forcedStoreId ? "COURIER"  : "PICKUP",
                products : cart.map(c => ({
                  pizzaId : c.pizzaId,
                  size    : c.size,
                  qty     : c.qty,
                  price   : c.price
                })),
                totalProducts: total,
                discounts    : 0,
                total
              };

              /* añade customer SOLO si es válido */
              if (customer && customer.phone && customer.phone.trim()) {
                payload.customer = customer;
              }

              await api.post("/api/sales", payload);

              alert("Sale saved!");
              setCart([]);
              onDone();
            } catch (e) {
              console.error(e);
              alert(e.response?.data?.error || "Error");
            }
          }}
        >
          Confirm sale
        </button>
        </>
      )}
    </div>
  );
}
