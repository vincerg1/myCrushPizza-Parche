// DeliverySaleForm – locate ▸ order ▸ review
import React, { useState, useRef, useCallback } from "react";
import api   from "../setupAxios";
import { debounce } from "lodash";
import {
  GoogleMap, Marker, Autocomplete, LoadScriptNext,
} from "@react-google-maps/api";

import CustomerModal from "./CustomerModal";
import LocalSaleForm from "./LocalSaleForm";
import { useAuth }   from "./AuthContext";

const GOOGLE_KEY =
  process.env.REACT_APP_GOOGLE_KEY ||
  (typeof import.meta !== "undefined"
    ? import.meta.env.REACT_APP_GOOGLE_KEY
    : undefined);

export default function DeliverySaleForm() {
  useAuth();                              // (mantener coherencia)

  /* ───── workflow ───── */
  const [step    , setStep    ] = useState("locate"); // locate › order › review
  const [query   , setQuery   ] = useState("");
  const [coords  , setCoords  ] = useState(null);     // {lat,lng}
  const [nearest , setNearest ] = useState(null);     // {storeId,…}
  const [customer, setCustomer] = useState(null);     // data BBDD
  const [showCus , setShowCus ] = useState(false);    // modal

  /* Autocomplete */
  const acRef = useRef(null);
  const onPlaceChanged = useCallback(
    debounce(async () => {
      const plc = acRef.current?.getPlace();
      if (!plc?.geometry) return;

      const fullAddr = plc.formatted_address.toUpperCase();
      const lat = plc.geometry.location.lat();
      const lng = plc.geometry.location.lng();

      setQuery(fullAddr);
      setCoords({ lat, lng });

      /* lookup cliente POR DIRECCIÓN COMPLETA */
      try {
        const { data } = await api.get("/api/customers/search", {
          params: { q: fullAddr },
        });
        setCustomer(data?.[0] ?? null);
      } catch { setCustomer(null); }

      /* tienda más cercana */
      try {
        const { data } = await api.get("/api/stores/nearest", {
          params: { lat, lng },
        });
        setNearest(data);
      } catch { setNearest(null); }
    }, 200),
    []
  );

  /* ───── Paso 1 : LOCATE ───── */
  const locateView = (
    <>
      <h3>New delivery sale</h3>

      <LoadScriptNext googleMapsApiKey={GOOGLE_KEY} libraries={["places"]}>
        <Autocomplete
          onLoad={(r) => (acRef.current = r)}
          onPlaceChanged={onPlaceChanged}
          options={{ componentRestrictions: { country: "es" } }}
        >
          <input
            style={{
              width: "100%", marginBottom: 8, textTransform: "uppercase",
            }}
            placeholder="TYPE ADDRESS…"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
          />
        </Autocomplete>
      </LoadScriptNext>

      {coords && (
        <LoadScriptNext googleMapsApiKey={GOOGLE_KEY}>
          <GoogleMap
            center={coords}
            zoom={15}
            mapContainerStyle={{ height: 300, width: "100%", margin: "12px 0", borderRadius: 6 }}
            options={{ disableDefaultUI: true }}
          >
            <Marker position={coords} />
          </GoogleMap>
        </LoadScriptNext>
      )}

      {nearest && !nearest.error && (
        <p>Closest store: <b>#{nearest.storeId}</b> (~{nearest.distanciaKm} km)</p>
      )}

      <div style={{ margin: "8px 0" }}>
        <button
          style={{
            background: customer ? "#28a745" : "#dc3545",
            color: "#fff",
            border: "none",
            padding: "6px 14px",
            borderRadius: 4,
          }}
          onClick={() => setShowCus(true)}
        >
          Customer details
        </button>

        <button
          style={{ marginLeft: 8 }}
          ddisabled={!(coords && nearest && customer)} 
          onClick={() => setStep("order")}
        >
          Next → products
        </button>
      </div>
    </>
  );

  /* ───── Paso 2 : ORDER (LocalSaleForm en modo compacto) ───── */
  const orderView = nearest?.storeId ? (
    <>
      <LocalSaleForm
        forcedStoreId={nearest.storeId}
        compact
        customer={customer}            /* ← le llega al backend */
        onDone={() => setStep("review")}
      />
      <button onClick={() => setStep("locate")}>← back</button>
    </>
  ) : (
    <>
      <p style={{ color: "red" }}>⚠️ Address without valid store.</p>
      <button onClick={() => setStep("locate")}>← back</button>
    </>
  );

  /* ───── Paso 3 : REVIEW (stub) ───── */
  const reviewView = (
    <>
      <h3>✅ Sale saved</h3>
      <button onClick={() => window.location.reload()}>New delivery sale</button>
    </>
  );

  async function handleDeleteCustomer(id) {
  const res = await api.delete(`/api/customers/${id}`);
  if (res.status === 200) {
    alert("Customer deleted!");
    setShowCus(false); // ✅ nombre correcto
    setCustomer(null); // opcional: limpiar el cliente seleccionado
  } else {
    alert("Failed to delete customer");
  }
}

  return (
    <>
      <div style={{ padding: 24 }}>
        {step === "locate" && locateView}
        {step === "order"  && orderView}
        {step === "review" && reviewView}
      </div>

      {showCus && (
        <CustomerModal
          initial={{
            ...customer,
            address: query,
            lat: coords?.lat,
            lng: coords?.lng,
          }}
          onClose={() => setShowCus(false)}
          onDelete={handleDeleteCustomer}
          onSave={async (data) => {
            try {
              const { data: saved } = await api.post("/api/customers", data);
              setCustomer(saved);
            } catch (e) { console.error(e); }
            setShowCus(false);
          }}
        />
      )}
    </>
  );
}
