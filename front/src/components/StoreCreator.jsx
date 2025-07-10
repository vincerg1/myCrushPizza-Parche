/* ───────────────────── src/components/StoreCreator.jsx ───────────────────── */
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "../styles/StoreCreator.css";
import { GoogleMap, Marker, LoadScriptNext } from "@react-google-maps/api";

/* ---------- Clave Maps ---------- */
const GOOGLE_KEY =
  process.env.REACT_APP_GOOGLE_KEY ??
  (typeof import.meta !== "undefined" ? import.meta.env.VITE_GOOGLE_KEY : "");

/* ---------- Pines para TIENDAS ---------- */
const STORE_GREEN_PIN = "https://maps.google.com/mapfiles/ms/icons/green-dot.png";
const STORE_GRAY_PIN  = "https://maps.google.com/mapfiles/ms/icons/ltblue-dot.png";

/* ---------- Devuelve un círculo de color cuando el SDK ya está listo ---------- */
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

/* ─────────────────────────── StockModal ─────────────────────────── */
function StockModal({ store, onClose }) {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [qty,  setQty ] = useState("");

  const load = async () => {
    const { data } = await axios.get(`/api/stock/${store.id}`);
    setRows(data);
  };
  useEffect(load, [store.id]);

  const saveQty = async () => {
    await axios.patch(`/api/stock/${store.id}/${edit}`, { set: Number(qty) });
    setQty(""); setEdit(null); load();
  };

  return (
    <div className="modal-back">
      <div className="modal-box">
        <h3>Stock – {store.storeName}</h3>
        <table className="ing-table">
          <thead><tr><th>Pizza</th><th>Unid.</th><th></th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.pizzaId}>
                <td>{r.pizza.name}</td>
                <td>{r.stock}</td>
                <td>
                  {edit === r.pizzaId ? (
                    <>
                      <input
                        type="number"
                        value={qty}
                        onChange={e => setQty(e.target.value)}
                        style={{ width: 60 }}
                      />
                      <button onClick={saveQty}>✓</button>
                    </>
                  ) : (
                    <button onClick={() => setEdit(r.pizzaId)}>✎</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="close-btn" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Componente principal ─────────────────────────── */
export default function StoreCreator() {
  const empty = { storeName:"", address:"", latitude:"", longitude:"",
                  city:"", zipCode:"", email:"", tlf:"" };

  const [form,      setForm]      = useState(empty);
  const [stores,    setStores]    = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showCust,  setShowCust ] = useState(false);
  const [modal,     setModal]     = useState(null);
  const [sdkReady,  setSdkReady ] = useState(false); // Google Maps listo

  /* ---------- fetch inicial ---------- */
  useEffect(() => {
    axios.get("/api/stores")   .then(r => setStores(r.data));
    axios.get("/api/customers").then(r => setCustomers(r.data));
  }, []);

  /* ---------- CRUD tiendas ---------- */
  const onChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const onSubmit = async e => {
    e.preventDefault();
    await axios.post("/api/stores", form);
    setForm(empty);
    const { data } = await axios.get("/api/stores");
    setStores(data);
  };

  const toggleActive = async (id, next) => {
    await axios.patch(`/api/stores/${id}/active`, { active: next });
    setStores(s => s.map(t => t.id === id ? { ...t, active: next } : t));
  };

  const delStore = async (id) => {
    if (!window.confirm("Delete store?")) return;
    await axios.delete(`/api/stores/${id}`);
    setStores(s => s.filter(t => t.id !== id));
  };

  /* ---------- centro mapa ---------- */
  const mapCenter = useMemo(() => {
    const first = stores.find(s => s.latitude && s.longitude);
    return first
      ? { lat:first.latitude, lng:first.longitude }
      : { lat:40.4168, lng:-3.7038 };
  }, [stores]);

  /* ---------- marcadores clientes ---------- */
const custMarkers = useMemo(() => {
  const red  = makeCircle("#e53935");
  const blue = makeCircle("#1e88e5");
  if (!red || !blue) return [];

  return customers
    .filter(c => c.lat && c.lng)
    .map(c => ({
      id   : c.id,
      pos  : { lat: c.lat, lng: c.lng },
      icon : c.daysOff != null && c.daysOff <= 10 ? red : blue,
      title: `${c.name || "Cliente"} – última compra ${
                c.daysOff != null ? `${c.daysOff} d` : "–"
              }`
    }));
}, [customers]);

  /* ---------- UI ---------- */
  return (
    <>
      {/* ---------- Formulario ---------- */}
      <form className="store-form" onSubmit={onSubmit}>
        <h2>Add Store</h2>
        {Object.keys(empty).map(k => (
          <label key={k}>{k}
            <input
              name={k}
              value={form[k]}
              onChange={onChange}
              required={k === "storeName" || k === "address"}
            />
          </label>
        ))}
        <button className="save-btn">Save store</button>
      </form>

      {/* ---------- Tabla ---------- */}
      <table className="ing-table" style={{ marginTop: 32 }}>
        <thead>
          <tr><th>Del</th><th>Name</th><th>City</th><th>Address</th>
              <th>Status</th><th>Stock</th></tr>
        </thead>
        <tbody>
          {stores.map(s => (
            <tr key={s.id}>
              <td>
                <button className="del-btn" onClick={() => delStore(s.id)}>✕</button>
              </td>
              <td>{s.storeName}</td>
              <td>{s.city}</td>
              <td>{s.address}</td>
              <td>
                <button
                  onClick={() => toggleActive(s.id, !s.active)}
                  className={s.active ? "st-btn on" : "st-btn off"}
                >
                  {s.active ? "Active" : "Inactive"}
                </button>
              </td>
              <td>
                <button className="stock-btn" onClick={() => setModal(s)}>
                  Ver stock
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------- Modal Stock ---------- */}
      {modal && <StockModal store={modal} onClose={() => setModal(null)} />}

      {/* ---------- Mapa ---------- */}
      <div style={{ marginTop: 40 }}>
        <h3>Store locations</h3>
        <button style={{ marginBottom: 6 }} onClick={() => setShowCust(p => !p)}>
          {showCust ? "Hide customer locations" : "Show customer locations"}
        </button>

        <LoadScriptNext
          googleMapsApiKey={GOOGLE_KEY}
          onLoad={() => setSdkReady(true)}              /* SDK listo */
        >
          <GoogleMap
            center={mapCenter}
            zoom={12}                                   /* zoom fijo */
            mapContainerStyle={{ width:"100%", height:440, borderRadius:10 }}
            options={{ disableDefaultUI:true }}
          >
            {/* tiendas (pines) */}
            {stores.filter(s => s.latitude && s.longitude).map(s => (
              <Marker
                key={`s${s.id}`}
                position={{ lat:s.latitude, lng:s.longitude }}
                icon={s.active ? STORE_GREEN_PIN : STORE_GRAY_PIN}
                title={`${s.storeName} (${s.active ? "active" : "inactive"})`}
              />
            ))}

            {/* clientes (círculos) */}
            {showCust && custMarkers.map(c => (
              <Marker
                key={`c${c.id}`}
                position={c.pos}
                icon={c.icon}
                title={c.title}
              />
            ))}
          </GoogleMap>
        </LoadScriptNext>
      </div>
    </>
  );
}
