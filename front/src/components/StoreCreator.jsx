import React, { useEffect, useMemo, useState } from "react";
import api from "../setupAxios";
import "../styles/StoreCreator.css";
import { GoogleMap, Marker, LoadScriptNext } from "@react-google-maps/api";

/* ─────────────── MAP CONFIG ─────────────── */
const GOOGLE_KEY =
  process.env.REACT_APP_GOOGLE_KEY ??
  (typeof import.meta !== "undefined" ? import.meta.env.REACT_APP_GOOGLE_KEY : "");

const STORE_GREEN_PIN = "https://maps.google.com/mapfiles/ms/icons/green-dot.png";
const STORE_GRAY_PIN  = "https://maps.google.com/mapfiles/ms/icons/ltblue-dot.png";

const makeCircle = (color) =>
  window.google
    ? {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: color,
        fillOpacity: 1,
        strokeWeight: 0,
      }
    : undefined;

/* ─────────────── STOCK MODAL ─────────────── */
function StockModal({ store, onClose }) {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [qty, setQty] = useState("");
  const [openCat, setOpenCat] = useState(null);

  useEffect(() => {
    if (!store?.id) return;
    api.get(`/api/stock/${store.id}`).then(r => setRows(r.data || []));
  }, [store?.id]);

  const saveQty = async () => {
    await api.patch(`/api/stock/${store.id}/${edit}`, { set: Number(qty) });
    const { data } = await api.get(`/api/stock/${store.id}`);
    setRows(data || []);
    setEdit(null);
    setQty("");
  };

  const grouped = useMemo(() => {
    const m = {};
    rows.forEach(r => {
      const cat = r?.pizza?.category || "Sin categoría";
      if (!m[cat]) m[cat] = [];
      m[cat].push(r);
    });
    return m;
  }, [rows]);

  return (
    <div className="sc-modalBack" onMouseDown={onClose}>
      <div className="sc-modalBox" onMouseDown={e => e.stopPropagation()}>
        <header className="sc-modalHead">
          <h3>Stock – {store.storeName}</h3>
          <button className="sc-iconBtn" onClick={onClose}>✕</button>
        </header>

        <div className="sc-modalBody">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="sc-stockSection">
              <button
                className="sc-stockSectionHead"
                onClick={() => setOpenCat(c => c === cat ? null : cat)}
              >
                {openCat === cat ? "▼" : "▶"} {cat} · {list.length}
              </button>

              {openCat === cat && (
                <table className="sc-stockTable">
                  <thead>
                    <tr>
                      <th>Pizza</th>
                      <th className="right">Unid.</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(r => (
                      <tr key={r.pizzaId}>
                        <td>{r.pizza.name}</td>
                        <td className="right">
                          {edit === r.pizzaId ? (
                            <input
                              type="number"
                              value={qty}
                              onChange={e => setQty(e.target.value)}
                            />
                          ) : r.stock}
                        </td>
                        <td>
                          {edit === r.pizzaId ? (
                            <button onClick={saveQty}>✓</button>
                          ) : (
                            <button onClick={() => {
                              setEdit(r.pizzaId);
                              setQty(r.stock);
                            }}>✎</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>

        <footer className="sc-modalFooter">
          <button className="sc-btn ghost" onClick={onClose}>Cerrar</button>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────── MAIN ─────────────── */
export default function StoreCreator() {
  const emptyStore = {
    storeName: "", address: "", latitude: "", longitude: "",
    city: "", zipCode: "", email: "", tlf: ""
  };

  const [stores, setStores] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showCust, setShowCust] = useState(false);
  const [stockModal, setStockModal] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyStore);

  /* LOAD */
  useEffect(() => {
    Promise.all([
      api.get("/api/stores"),
      api.get("/api/customers"),
    ]).then(([s, c]) => {
      setStores(s.data || []);
      setCustomers(c.data || []);
    });
  }, []);

  /* CRUD */
  const submitStore = async e => {
    e.preventDefault();
    await api.post("/api/stores", form);
    const { data } = await api.get("/api/stores");
    setStores(data || []);
    setForm(emptyStore);
    setShowAdd(false);
  };

  const toggleActive = async (id, next) => {
    await api.patch(`/api/stores/${id}/active`, { active: next });
    setStores(s => s.map(t => t.id === id ? { ...t, active: next } : t));
  };

  const deleteStore = async id => {
    if (!window.confirm("Delete store?")) return;
    await api.delete(`/api/stores/${id}`);
    setStores(s => s.filter(t => t.id !== id));
  };

  /* MAP */
  const center = useMemo(() => {
    const s = stores.find(x => x.latitude && x.longitude);
    return s ? { lat: s.latitude, lng: s.longitude } : { lat: 40.4168, lng: -3.7038 };
  }, [stores]);

  const custMarkers = useMemo(() => {
    const red = makeCircle("#e53935");
    const blue = makeCircle("#1e88e5");
    if (!red || !blue) return [];
    return customers
      .filter(c => c.lat && c.lng)
      .map(c => ({
        id: c.id,
        pos: { lat: c.lat, lng: c.lng },
        icon: c.daysOff <= 10 ? red : blue,
        title: c.name,
      }));
  }, [customers]);

  return (
    <>
      <div className="sc-page">
        {/* HEADER */}
        <header className="sc-header">
          <h2>Stores</h2>
          <button className="sc-btn primary" onClick={() => setShowAdd(true)}>
            + Add store
          </button>
        </header>

        {/* STORES LIST */}
        <section className="sc-card">
          <h3>Stores list</h3>

          <table className="store-table">
            <thead>
              <tr>
                <th>Del</th>
                <th>Name</th>
                <th>City</th>
                <th>Address</th>
                <th>Status</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {stores.map(s => (
                <tr key={s.id}>
                  <td>
                    <button className="table-btn danger" onClick={() => deleteStore(s.id)}>✕</button>
                  </td>
                  <td>{s.storeName}</td>
                  <td>{s.city}</td>
                  <td>{s.address}</td>
                  <td>
                    <button
                      className={`table-btn status ${s.active ? "active" : "inactive"}`}
                      onClick={() => toggleActive(s.id, !s.active)}
                    >
                      {s.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td>
                    <button className="table-btn stock" onClick={() => setStockModal(s)}>
                      Ver stock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* MAP */}
      <section className="sc-card sc-mapCard">
        <div className="sc-cardHead sc-mapHead">
          <h3 className="sc-cardTitle">Store locations</h3>

          <button
            type="button"
            className="sc-btn ghost"
            onClick={() => setShowCust(p => !p)}
          >
            {showCust ? "Hide customers" : "Show customers"}
          </button>
        </div>

          <LoadScriptNext googleMapsApiKey={GOOGLE_KEY}>
            <GoogleMap
              center={center}
              zoom={12}
              mapContainerStyle={{ width: "100%", height: 440 }}
              options={{ disableDefaultUI: true }}
            >
              {stores.filter(s => s.latitude && s.longitude).map(s => (
                <Marker
                  key={s.id}
                  position={{ lat: s.latitude, lng: s.longitude }}
                  icon={s.active ? STORE_GREEN_PIN : STORE_GRAY_PIN}
                />
              ))}

              {showCust && custMarkers.map(c => (
                <Marker key={c.id} position={c.pos} icon={c.icon} />
              ))} 
            </GoogleMap> 
          </LoadScriptNext> 
        </section> 
        
      </div>

      {/* ADD STORE MODAL */}
      {showAdd && (
        <div className="sc-modalBack" onMouseDown={() => setShowAdd(false)}>
          <div className="sc-modalBox" onMouseDown={e => e.stopPropagation()}>
            <h3>Add Store</h3>
            <form onSubmit={submitStore} className="store-form">
              {Object.keys(emptyStore).map(k => (
                <label key={k}>
                  {k}
                  <input
                    name={k}
                    value={form[k]}
                    onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                  />
                </label>
              ))}
              <button className="sc-btn primary">Save store</button>
            </form>
          </div>
        </div>
      )}

      {stockModal && <StockModal store={stockModal} onClose={() => setStockModal(null)} />}
    </>
  );
}
