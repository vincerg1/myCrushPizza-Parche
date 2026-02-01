// DeliverySaleForm – locate ▸ order ▸ review
import React, { useState, useRef, useCallback } from "react";
import api from "../setupAxios";
import { debounce } from "lodash";
import {
  GoogleMap,
  Marker,
  Autocomplete,
  LoadScriptNext,
} from "@react-google-maps/api";

import CustomerModal from "./CustomerModal";
import LocalSaleForm from "./LocalSaleForm";
import { useAuth } from "./AuthContext";

const GOOGLE_KEY =
  process.env.REACT_APP_GOOGLE_KEY ||
  (typeof import.meta !== "undefined"
    ? import.meta.env.REACT_APP_GOOGLE_KEY
    : undefined);

export default function DeliverySaleForm() {
  useAuth();

  /* ───── workflow ───── */
  const [step, setStep] = useState("locate"); // locate › order › review
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState(null);     // {lat,lng}
  const [nearest, setNearest] = useState(null);   // {storeId,…}

  const [customer, setCustomer] = useState(null);     // UI / preview
  const [customerId, setCustomerId] = useState(null); // 🔥 fuente de verdad

  const [showCus, setShowCus] = useState(false);

  /* ───── Autocomplete ───── */
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

      // 🔍 buscar cliente por dirección
      try {
        const { data } = await api.get("/api/customers/search", {
          params: { q: fullAddr },
        });
        const found = data?.[0] ?? null;
        setCustomer(found);
        setCustomerId(found?.id ?? null);
      } catch {
        setCustomer(null);
        setCustomerId(null);
      }

      // 🏪 tienda más cercana
      try {
        const { data } = await api.get("/api/stores/nearest", {
          params: { lat, lng },
        });
        setNearest(data);
      } catch {
        setNearest(null);
      }
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
              width: "100%",
              marginBottom: 8,
              textTransform: "uppercase",
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
            mapContainerStyle={{
              height: 300,
              width: "100%",
              margin: "12px 0",
              borderRadius: 6,
            }}
            options={{ disableDefaultUI: true }}
          >
            <Marker position={coords} />
          </GoogleMap>
        </LoadScriptNext>
      )}

      {nearest && !nearest.error && (
        <p>
          Closest store: <b>#{nearest.storeId}</b> (~
          {nearest.distanciaKm} km)
        </p>
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
          disabled={!(coords && nearest && customerId)}
          onClick={() => setStep("order")}
        >
          Next → products
        </button>
      </div>
    </>
  );

  /* ───── Paso 2 : ORDER ───── */
  const orderView = nearest?.storeId ? (
    <>
      <LocalSaleForm
        forcedStoreId={nearest.storeId}
        compact
        customerId={customerId}   // 🔥 SOLO ID
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

  /* ───── Paso 3 : REVIEW ───── */
  const reviewView = (
    <>
      <h3>✅ Sale saved</h3>
      <button onClick={() => window.location.reload()}>
        New delivery sale
      </button>
    </>
  );

  async function handleDeleteCustomer(id) {
    const res = await api.delete(`/api/customers/${id}`);
    if (res.status === 200) {
      setCustomer(null);
      setCustomerId(null);
      setShowCus(false);
    }
  }

  return (
    <>
      <div style={{ padding: 24 }}>
        {step === "locate" && locateView}
        {step === "order" && orderView}
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
              const payload = {
                name: data.name ?? null,
                phone: data.phone,
                address_1: data.address_1 ?? null,
                observations: data.observations ?? null,
                lat: data.lat ?? null,
                lng: data.lng ?? null,
              };

              const res = data.id
                ? await api.patch(`/api/customers/${data.id}`, payload)
                : await api.post("/api/customers", payload);

              setCustomer(res.data);
              setCustomerId(res.data.id); // 🔥 CLAVE
              setShowCus(false);
            } catch (e) {
              console.error("❌ Error saving customer", e);
              alert("Error saving customer data");
            }
          }}
        />
      )}
    </>
  );
}
