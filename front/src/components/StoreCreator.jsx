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
function StoreHoursModal({ store, onClose }) {

  const [rows,setRows] = useState([]);
  const [localRows,setLocalRows] = useState([]);
const [appliedAllDays,setAppliedAllDays] = useState(false);

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
  ];

  const dayMap = {
    Monday:1,
    Tuesday:2,
    Wednesday:3,
    Thursday:4,
    Friday:5,
    Saturday:6,
    Sunday:0
  };

  useEffect(()=>{
    load();
  },[store?.id]);

  const load = async ()=>{
    const {data} = await api.get(`/api/store-hours/${store.id}`);
    setRows(data || []);
    setLocalRows(data || []);
  };

  /* ───────── helpers ───────── */

  const toTime = (m)=>{
    const h = String(Math.floor(m/60)).padStart(2,"0");
    const min = String(m%60).padStart(2,"0");
    return `${h}:${min}`;
  };

  const hours = [...Array(24)].map((_,i)=>i);

  const minutes = [0,15,30,45];

  const updateLocal = (id,field,value)=>{
    setLocalRows(prev =>
      prev.map(r =>
        r.id === id
          ? { ...r, [field]: value }
          : r
      )
    );
  };

  /* ───────── slots by day ───────── */

  const slotsByDay = {};

  days.forEach(d=>slotsByDay[d]=[]);

  localRows.forEach(r=>{
    const name = Object.keys(dayMap).find(
      k=>dayMap[k]===r.dayOfWeek
    );
    if(name) slotsByDay[name].push(r);
  });

  /* ───────── add slot ───────── */

  const addSlot = (day)=>{

    const newSlot = {
      id:`tmp-${Math.random()}`,
      storeId:store.id,
      dayOfWeek:dayMap[day],
      openTime:1140,
      closeTime:1380,
      isNew:true
    };

    setLocalRows(prev=>[...prev,newSlot]);
  };

  /* ───────── delete slot ───────── */

  const removeSlot = (id)=>{
    setLocalRows(prev => prev.filter(r=>r.id!==id));
  };

  /* ───────── APPLY HELPERS ───────── */

const applyWeekdays = () => {

  const mondaySlots = localRows.filter(
    r => r.dayOfWeek === dayMap["Monday"]
  );

  if (!mondaySlots.length) return;

  const weekdays = [
    dayMap["Tuesday"],
    dayMap["Wednesday"],
    dayMap["Thursday"],
    dayMap["Friday"]
  ];

  const newRows = [];

  weekdays.forEach(day => {

    mondaySlots.forEach(slot => {

      newRows.push({
        ...slot,
        id:`tmp-${Math.random()}`,
        dayOfWeek:day,
        isNew:true
      });

    });

  });

  setLocalRows(prev => [

    ...prev.filter(r =>
      !weekdays.includes(r.dayOfWeek)
    ),

    ...newRows

  ]);

};

const applyAllDays = () => {

  const monday = dayMap["Monday"];

  /* slots de Monday */
  const mondaySlots = localRows.filter(
    r => r.dayOfWeek === monday
  );

  if (!mondaySlots.length) return;

  /* generar slots nuevos */
  const newRows = [];

  Object.values(dayMap).forEach(day => {

    if (day === monday) return;

    mondaySlots.forEach(slot => {

      newRows.push({
        ...slot,
        id: `tmp-${crypto.randomUUID()}`,
        dayOfWeek: day,
        isNew: true
      });

    });

  });

  /* reconstruir lista */
  setLocalRows(prev => {

    const mondayOnly = prev.filter(
      r => r.dayOfWeek === monday
    );

    return [
      ...mondayOnly,
      ...newRows
    ];

  });

  setAppliedAllDays(true);

};

  /* ───────── SAVE ───────── */

  const save = async ()=>{

    const originalIds = rows.map(r=>r.id);

    const currentIds = localRows
      .filter(r=>!String(r.id).startsWith("tmp"))
      .map(r=>r.id);

    const deleted = originalIds.filter(
      id=>!currentIds.includes(id)
    );

    /* delete removed */

    for(const id of deleted){
      await api.delete(`/api/store-hours/${id}`);
    }

    /* create new */

    for(const r of localRows){
      if(String(r.id).startsWith("tmp")){
        await api.post("/api/store-hours",{
          storeId:store.id,
          dayOfWeek:r.dayOfWeek,
          openTime:r.openTime,
          closeTime:r.closeTime
        });
      }
    }

    /* update existing */

    for(const r of localRows){
      if(!String(r.id).startsWith("tmp")){
        await api.patch(`/api/store-hours/${r.id}`,{
          openTime:r.openTime,
          closeTime:r.closeTime
        });
      }
    }

    load();
  };

  /* ───────── UI ───────── */

  return (

    <div className="sc-modalBack" onMouseDown={onClose}>
      <div className="sc-modalBox" onMouseDown={e=>e.stopPropagation()}>

        <header className="sc-modalHead">
          <h3>Hours – {store.storeName}</h3>
          <button className="sc-iconBtn" onClick={onClose}>✕</button>
        </header>
          <div style={{display:"flex",gap:"10px",marginBottom:"15px"}}>

           

        <button
          className={`sc-btn applyAll ${appliedAllDays ? "active" : ""}`}
          onClick={applyAllDays}
        >
          Apply to all days
        </button>

          </div>
        <div className="sc-modalBody">

          {days.map(day=>(

            <div key={day} className="sc-hoursDay">

              <div className="sc-hoursDayHead">
                <strong>{day}</strong>

                <button
                  className="table-btn"
                  onClick={()=>addSlot(day)}
                >
                  + Add slot
                </button>
              </div>

              {slotsByDay[day].map(slot=>{

                const openH = Math.floor(slot.openTime/60);
                const openM = slot.openTime%60;

                const closeH = Math.floor(slot.closeTime/60);
                const closeM = slot.closeTime%60;

                return(

                  <div key={slot.id} className="sc-hoursRow">

                    {/* open hour */}

                    <select
                      value={openH}
                      onChange={e=>updateLocal(
                        slot.id,
                        "openTime",
                        Number(e.target.value)*60 + openM
                      )}
                    >
                      {hours.map(h=>(
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>

                    :

                    <select
                      value={openM}
                      onChange={e=>updateLocal(
                        slot.id,
                        "openTime",
                        openH*60 + Number(e.target.value)
                      )}
                    >
                      {minutes.map(m=>(
                        <option key={m} value={m}>{String(m).padStart(2,"0")}</option>
                      ))}
                    </select>

                    <span>—</span>

                    {/* close hour */}

                    <select
                      value={closeH}
                      onChange={e=>updateLocal(
                        slot.id,
                        "closeTime",
                        Number(e.target.value)*60 + closeM
                      )}
                    >
                      {hours.map(h=>(
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>

                    :

                    <select
                      value={closeM}
                      onChange={e=>updateLocal(
                        slot.id,
                        "closeTime",
                        closeH*60 + Number(e.target.value)
                      )}
                    >
                      {minutes.map(m=>(
                        <option key={m} value={m}>{String(m).padStart(2,"0")}</option>
                      ))}
                    </select>

                    <button
                      className="table-btn danger"
                      onClick={()=>removeSlot(slot.id)}
                    >
                      ✕
                    </button>

                  </div>

                );

              })}

            </div>

          ))}

        </div>

        <footer className="sc-modalFooter">

  <button
    className="sc-btn ghost"
    onClick={onClose}
  >
    Cancel
  </button>

  <button
    className="sc-btn primary"
    onClick={async ()=>{
      await save();
      onClose();
    }}
  >
    Save & Close
  </button>

</footer>

      </div>
    </div>
  );
}

/* ─────────────── RESERVATIONS MODAL ─────────────── */

function ReservationsModal({ store, onClose }) {

  const [rows,setRows] = useState([]);

  useEffect(()=>{

    if(!store?.id) return;

    api
      .get(`/api/reservations/store/${store.id}`)
      .then(r => setRows(r.data || []));

  },[store?.id]);

  const cancelReservation = async(id)=>{

    if(!window.confirm("Cancel this reservation?")) return;

    await api.patch(`/api/reservations/${id}/cancel`);

    setRows(prev =>
      prev.map(r =>
        r.id === id
          ? { ...r, status:"cancelled" }
          : r
      )
    );

  };

  return (

    <div className="sc-modalBack" onMouseDown={onClose}>

      <div className="sc-modalBox" onMouseDown={e=>e.stopPropagation()}>

        <header className="sc-modalHead">
          <h3>Reservations – {store.storeName}</h3>
          <button className="sc-iconBtn" onClick={onClose}>✕</button>
        </header>

        <div className="sc-modalBody">

          <table className="store-table">

            <thead>
              <tr>
                
                <th>Date</th>
                <th>Time</th>
                <th>Name</th>
                <th>Phone</th>
                <th>People</th>
                <th>Status</th>
                <th className="actions">Actions</th>
                <th></th>
              </tr>
            </thead>

            <tbody>

              {rows.map(r=>{

                const date =
                  new Date(r.reservationDate)
                  .toLocaleDateString("es-ES");

                return(

                  <tr key={r.id}>

                    <td>{date}</td>
                    <td>{r.reservationTime}</td>
                    <td>{r.customerName}</td>
                    <td>{r.customerPhone}</td>
                    <td>{r.partySize}</td>
                    <td>{r.status}</td>
                    <td className="actions">

                    {r.status === "pending" ? (

                    <button
                    className="table-btn cancel"
                    onClick={()=>cancelReservation(r.id)}
                    >
                    Cancel
                    </button>

                    ) : (

                    <button
                      className="table-btn cancel cancelled"
                      disabled
                      >
                      Cancelled
                      </button>

                    )}

                    </td>

                  </tr>

                );

              })}

            </tbody>

          </table>

        </div>

        <footer className="sc-modalFooter">
          <button className="sc-btn ghost" onClick={onClose}>
            Close
          </button>
        </footer>

      </div>

    </div>

  );

}
/* ─────────────── MAIN ─────────────── */
export default function StoreCreator() {
const emptyStore = {
  storeName: "",
  address: "",
  latitude: "",
  longitude: "",
  city: "",
  zipCode: "",
  email: "",
  tlf: "",
  acceptsReservations: false,
  reservationCapacity: ""
};

  const [stores, setStores] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [showCust, setShowCust] = useState(false);
  const [stockModal, setStockModal] = useState(null);
  const [hoursModal, setHoursModal] = useState(null);
  const [reservationsModal, setReservationsModal] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyStore);
  const [editingStore, setEditingStore] = useState(null);

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
const submitStore = async (e) => {
  e.preventDefault();

  const payload = {
    ...form,
    reservationCapacity: form.acceptsReservations
      ? Number(form.reservationCapacity || 0)
      : null
  };

  if (editingStore) {
    await api.patch(`/api/stores/${editingStore}`, payload);
  } else {
    await api.post("/api/stores", payload);
  }

  const { data } = await api.get("/api/stores");

  setStores(data || []);
  setForm(emptyStore);
  setEditingStore(null);
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

  const editStore = (store) => {
  setEditingStore(store.id);

  setForm({
    storeName: store.storeName || "",
    address: store.address || "",
    latitude: store.latitude || "",
    longitude: store.longitude || "",
    city: store.city || "",
    zipCode: store.zipCode || "",
    email: store.email || "",
    tlf: store.tlf || "",
    acceptsReservations: store.acceptsReservations || false,
    reservationCapacity: store.reservationCapacity || ""
  });

  setShowAdd(true);
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
                <th>Edit</th>
                <th>Name</th>
                <th>City</th>
                <th>Address</th>
                <th>Status</th>
                <th>Stock</th>
                <th>Hours</th>
                <th>Reservations</th>
              </tr>
            </thead>
            <tbody>
              {stores.map(s => (
                <tr key={s.id}>
                  <td>
                    <button className="table-btn danger" onClick={() => deleteStore(s.id)}>✕</button>
                  </td>
                  <td>
                  <button
                    className="table-btn edit"
                    onClick={() => editStore(s)}
                  >
                    ✎
                  </button>
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
                  <td>
                  <button
                    className="table-btn hours"
                    onClick={() => setHoursModal(s)}
                  >
                    Hours
                  </button>
                </td>
                <td>
                <button
                  className="table-btn reservations"
                  onClick={() => setReservationsModal(s)}
                >
                  Reservations
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
              mapContainerStyle={{ width: "100%", height: 300 }}
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
    <div
      className="sc-modalBox"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* HEADER */}
      <header className="sc-modalHead">
       <h3 className="sc-modalTitle">
          {editingStore ? "Edit store" : "Add store"}
        </h3>
        <button
          className="sc-iconBtn"
          onClick={() => {
            setShowAdd(false);
            setEditingStore(null);
          }}
        >
          ✕
        </button>
      </header>

      {/* BODY */}
      <form onSubmit={submitStore} className="sc-modalBody store-form">
        <div className="sc-field">
          <label className="sc-label">Store name</label>
          <input
            className="sc-input"
            value={form.storeName}
            onChange={(e) =>
              setForm((p) => ({ ...p, storeName: e.target.value }))
            }
          />
        </div>

        <div className="sc-field">
          <label className="sc-label">Address</label>
          <input
            className="sc-input"
            value={form.address}
            onChange={(e) =>
              setForm((p) => ({ ...p, address: e.target.value }))
            }
          />
        </div>

        <div className="sc-field">
          <label className="sc-label">Latitude</label>
          <input
            className="sc-input"
            value={form.latitude}
            onChange={(e) =>
              setForm((p) => ({ ...p, latitude: e.target.value }))
            }
          />
        </div>

        <div className="sc-field">
          <label className="sc-label">Longitude</label>
          <input
            className="sc-input"
            value={form.longitude}
            onChange={(e) =>
              setForm((p) => ({ ...p, longitude: e.target.value }))
            }
          />
        </div>

        <div className="sc-field">
          <label className="sc-label">City</label>
          <input
            className="sc-input"
            value={form.city}
            onChange={(e) =>
              setForm((p) => ({ ...p, city: e.target.value }))
            }
          />
        </div>

        <div className="sc-field">
          <label className="sc-label">Zip code</label>
          <input
            className="sc-input"
            value={form.zipCode}
            onChange={(e) =>
              setForm((p) => ({ ...p, zipCode: e.target.value }))
            }
          />
        </div>

        <div className="sc-field">
          <label className="sc-label">Email</label>
          <input
            className="sc-input"
            value={form.email}
            onChange={(e) =>
              setForm((p) => ({ ...p, email: e.target.value }))
            }
          />
        </div>

        <div className="sc-field">
          <label className="sc-label">Phone</label>
          <input
            className="sc-input"
            value={form.tlf}
            onChange={(e) =>
              setForm((p) => ({ ...p, tlf: e.target.value }))
            }
          />
        </div>
          {/* RESERVATIONS */}
          <div className="sc-field">
            <label className="sc-label">Accept reservations</label>

               <button
                  type="button"
                  className={`sc-toggle ${form.acceptsReservations ? "on" : ""}`}
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      acceptsReservations: !p.acceptsReservations
                    }))
                  }
                >
                  <span className="sc-toggle-knob"></span>
                </button>
          </div>

          {form.acceptsReservations && (
            <div className="sc-field">
              <label className="sc-label">Reservation capacity (people)</label>

              <input
                type="number"
                className="sc-input"
                min="1"
                value={form.reservationCapacity}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    reservationCapacity: e.target.value
                  }))
                }
              />
            </div>
          )}
        {/* FOOTER */}
        <div className="sc-modalFooter">
          <button
            type="button"
            className="sc-btn ghost"
            onClick={() => setShowAdd(false)}
          >
            Cancel
          </button>

          <button type="submit" className="sc-btn primary">
            Save store
          </button>
        </div>
      </form>
    </div>
  </div>
)}


      {stockModal && <StockModal store={stockModal} onClose={() => setStockModal(null)} />}
        {hoursModal && (
  <StoreHoursModal
    store={hoursModal}
    onClose={() => setHoursModal(null)}
  />
  
)}
{reservationsModal && (
  <ReservationsModal
    store={reservationsModal}
    onClose={() => setReservationsModal(null)}
  />
)}
    </>
  );
}
