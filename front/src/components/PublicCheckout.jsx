// src/components/PublicCheckout.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../setupAxios";
import { LoadScriptNext, Autocomplete, GoogleMap, Marker } from "@react-google-maps/api";
import LocalSaleForm from "./LocalSaleForm";
import CustomerModal from "./CustomerModal";
import "../styles/PublicCheckout.css";
import logo from "../logo/nuevoLogoMyCrushPizza.jpeg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp, faTiktok } from "@fortawesome/free-brands-svg-icons";
import { faMobileScreenButton } from "@fortawesome/free-solid-svg-icons";

const GOOGLE_KEY =
  process.env.REACT_APP_GOOGLE_KEY ||
  (typeof import.meta !== "undefined" ? import.meta.env.REACT_APP_GOOGLE_KEY : undefined);

const COUNTRY = "ES";
const DELIVERY_FEE = 2.5;
const DELIVERY_BLOCK = 5;
const DELIVERY_MAX_KM = Number(
  process.env.REACT_APP_DELIVERY_MAX_KM || process.env.DELIVERY_MAX_KM || 7
);

// Utils
const phoneDigits = (s) => (s || "").replace(/\D/g, "");
const hasBaseCustomer = (c) => !!(c?.name?.trim() && phoneDigits(c?.phone).length >= 7);

// Reverse geocode
async function reverseGeocode({ lat, lng }) {
  return new Promise((resolve) => {
    if (!window.google?.maps) return resolve(null);
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng }, region: COUNTRY }, (results, status) => {
      if (status === "OK" && results?.[0]?.formatted_address) resolve(results[0].formatted_address);
      else resolve(null);
    });
  });
}

export default function PublicCheckout() {
  // Flow: choose → deliveryLocate/pickupLocate (locate) → order → review
  const [mode, setMode] = useState("choose");
  const [step, setStep] = useState("locate");

  // comunes / delivery
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState(null);
  const [nearest, setNearest] = useState(null);
  const [outOfRange, setOutOfRange] = useState(false);

  // pickup
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 40.4168, lng: -3.7038 }); // Madrid fallback
  const [mapZoom, setMapZoom] = useState(12);

  // cliente / carrito
  const [customer, setCustomer] = useState(null);
  const [showCus, setShowCus] = useState(false);
  const [pending, setPending] = useState(null);
  const [flashCus, setFlashCus] = useState(false);

  // validación visual + cache dirección tienda
  const [triedNext, setTriedNext] = useState(false);
  const [storeAddrById, setStoreAddrById] = useState({});

  // pagar
  const [isPaying, setIsPaying] = useState(false);

  // ===== helpers tienda =====
  const getStoreById = useCallback(
    (id) => stores.find((s) => Number(s.id) === Number(id)),
    [stores]
  );

  const ensureStoreAddress = useCallback(
    async (id) => {
      const s = getStoreById(id);
      if (!s) return null;

      const inline = s.address_1 || s.address || s.street || s.fullAddress || null;
      if (inline) {
        setStoreAddrById((m) => ({ ...m, [id]: inline }));
        return inline;
      }

      if (typeof s.latitude === "number" && typeof s.longitude === "number") {
        const addr = await reverseGeocode({ lat: s.latitude, lng: s.longitude });
        if (addr) setStoreAddrById((m) => ({ ...m, [id]: addr }));
        return addr;
      }
      return null;
    },
    [getStoreById]
  );

  // ===== DELIVERY: Autocomplete =====
  const acRef = useRef(null);
  const onPlaceChanged = useCallback(async () => {
    const plc = acRef.current?.getPlace();
    if (!plc?.geometry) return;

    const fullAddr = plc.formatted_address?.toUpperCase() || "";
    const lat = plc.geometry.location.lat();
    const lng = plc.geometry.location.lng();

    setQuery(fullAddr);
    setCoords({ lat, lng });

    try {
      const { data } = await api.get("/api/customers/search", { params: { q: fullAddr } });
      setCustomer(data?.[0] ?? null);
    } catch {
      setCustomer(null);
    }

    try {
      const { data } = await api.get("/api/stores/nearest", { params: { lat, lng } });
      setNearest(data);
      const km = Number(data?.distanciaKm);
      setOutOfRange(Number.isFinite(km) ? km > DELIVERY_MAX_KM : false);
    } catch {
      setNearest(null);
      setOutOfRange(false);
    }
  }, []);

  // ===== CUPÓN =====
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState(null); // { code, percent }
  const [couponMsg, setCouponMsg] = useState("");
  const [couponOk, setCouponOk] = useState(false);

  const checkCoupon = useCallback(async () => {
    const code = (couponCode || "").trim().toUpperCase();
    if (!code) {
      setCoupon(null);
      setCouponOk(false);
      setCouponMsg("Introduce un cupón.");
      return;
    }
    try {
      const { data } = await api.get("/api/coupons/validate", { params: { code } });
      if (data?.valid) {
        const pct = Number(data.percent) || 0;
        setCoupon({ code, percent: pct });
        setCouponOk(true);
        setCouponMsg(`Cupón aplicado: ${pct}%`);
      } else {
        setCoupon(null);
        setCouponOk(false);
        setCouponMsg("Cupón inválido o ya usado.");
      }
    } catch {
      setCoupon(null);
      setCouponOk(false);
      setCouponMsg("No se pudo validar el cupón.");
    }
  }, [couponCode]);

  // ===== PICKUP: cargar tiendas activas con coordenadas =====
  useEffect(() => {
    if (mode !== "pickupLocate") return;
    (async () => {
      try {
        const { data } = await api.get("/api/stores");
        const actives = (Array.isArray(data) ? data : []).filter(
          (s) => s?.active && typeof s.latitude === "number" && typeof s.longitude === "number"
        );
        setStores(actives);
        if (actives.length) {
          setMapCenter({ lat: actives[0].latitude, lng: actives[0].longitude });
          setMapZoom(12);
        }
      } catch {
        setStores([]);
      }
    })();
  }, [mode]);

  // ---- validaciones para “Siguiente → productos”
  const addrOk =
    mode !== "deliveryLocate" ||
    (!!(query?.trim() || customer?.address_1?.trim()) && !!coords && !!nearest?.storeId && !outOfRange);
  const baseOk = hasBaseCustomer(customer);

  const nextGuard = () => {
    setTriedNext(true);
    if (mode === "deliveryLocate") {
      if (!baseOk) {
        flashCustomerBtn();
      }
      return baseOk && addrOk;
    } else {
      if (!baseOk) {
        flashCustomerBtn();
      }
      return baseOk && !!selectedStoreId;
    }
  };

  // =================== SWIPE NAV ===================
  const tStart = useRef({ x: 0, y: 0, at: 0, target: null });
  const SWIPE_X = 70; // px
  const SWIPE_Y_MAX = 40; // px vertical máximo

  const isInteractive = (el) => {
    if (!el) return false;
    const tag = el.tagName;
    if (!tag) return false;
    const t = tag.toUpperCase();
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "LABEL"].includes(t)) return true;
    return el.closest?.("[data-noswipe]") ? true : false;
  };

  const goBack = () => {
    if (mode === "deliveryLocate" || mode === "pickupLocate") {
      setMode("choose");
      setStep("locate");
      return;
    }
    if (step === "review") {
      setStep("order");
      return;
    }
    if (step === "order") {
      setStep("locate");
      return;
    }
  };

  const goForward = () => {
    if (step === "locate") {
      if (nextGuard()) setStep("order");
      return;
    }
    if (step === "order") {
      if (pending) setStep("review");
      return;
    }
  };

  const onTouchStart = (e) => {
    const t = e.touches[0];
    tStart.current = { x: t.clientX, y: t.clientY, at: Date.now(), target: e.target };
  };

  const onTouchMove = (e) => {
    if (!tStart.current.target || isInteractive(tStart.current.target)) return;
    const t = e.touches[0];
    const dx = t.clientX - tStart.current.x;
    const dy = Math.abs(t.clientY - tStart.current.y);
    if (Math.abs(dx) > SWIPE_X && dy < SWIPE_Y_MAX) e.preventDefault();
  };

  const onTouchEnd = (e) => {
    if (!tStart.current.target || isInteractive(tStart.current.target)) return;
    const changed = e.changedTouches?.[0];
    if (!changed) return;
    const dx = changed.clientX - tStart.current.x;
    const dy = Math.abs(changed.clientY - tStart.current.y);
    if (Math.abs(dx) > SWIPE_X && dy < SWIPE_Y_MAX) {
      if (dx < 0) goForward();
      else goBack();
    }
  };

  // soporte teclado (desktop)
  const onKeyDown = (e) => {
    if (e.key === "ArrowLeft") goBack();
    if (e.key === "ArrowRight") goForward();
  };

  // =================== VISTAS ===================
  const flashCustomerBtn = useCallback(() => {
    setFlashCus(true);
    setTimeout(() => setFlashCus(false), 650);
  }, []);

  // Paso 0: escoger modo
  const chooseMode = (
    <div className="pc-card pc-card--hero">
      <img src={logo} alt="MyCrushPizza" className="pc-logo pc-logo--bleed" />
      <h2 className="pc-title pc-title-center pc-title-pulse">¿Cómo quieres tu pedido?</h2>

      <div className="pc-choice">
        <button
          className="pc-btn pc-btn-primary"
          style={{ fontSize: "18px" }}
          onClick={() => {
            setMode("pickupLocate");
            setStep("locate");
            setTriedNext(false);
          }}
        >
          🧍‍♂️ Recoger en tienda
        </button>

        <button
          className="pc-btn pc-btn-primary"
          style={{ fontSize: "18px" }}
          onClick={() => {
            setMode("deliveryLocate");
            setStep("locate");
            setTriedNext(false);
          }}
        >
          🏍️ Enviar a domicilio
        </button>
      </div>
    </div>
  );

  const deliveryLocateView = (
    <div className="pc-card">
      <div className="pc-actions" style={{ marginBottom: 8 }}>
        <button
          className="pc-btn pc-btn-ghost push"
          onClick={() => {
            setMode("pickupLocate");
            setStep("locate");
            setTriedNext(false);
          }}
        >
          ← cambiar a recoger
        </button>
      </div>

      <h2 className="pc-title">Indica tu dirección</h2>

      <LoadScriptNext googleMapsApiKey={GOOGLE_KEY} libraries={["places"]}>
        <Autocomplete
          onLoad={(r) => (acRef.current = r)}
          onPlaceChanged={onPlaceChanged}
          options={{
            componentRestrictions: { country: COUNTRY },
            fields: ["formatted_address", "geometry"],
            types: ["geocode"],
          }}
        >
          <input
            className={`pc-input ${triedNext && !addrOk ? "is-error" : ""}`}
            placeholder="ESCRIBE TU DIRECCIÓN…"
            style={{ textTransform: "uppercase" }}
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
          />
        </Autocomplete>
      </LoadScriptNext>

      {coords && (
        <LoadScriptNext googleMapsApiKey={GOOGLE_KEY}>
          <div className="pc-map" data-noswipe>
            <GoogleMap
              center={coords}
              zoom={15}
              mapContainerStyle={{ width: "100%", height: "100%" }}
              options={{ disableDefaultUI: true }}
            >
              <Marker
                position={coords}
                draggable
                onDragEnd={async (e) => {
                  const lat = e.latLng.lat();
                  const lng = e.latLng.lng();
                  setCoords({ lat, lng });
                  const addr = await reverseGeocode({ lat, lng });
                  if (addr) setQuery(addr.toUpperCase());
                  try {
                    const { data } = await api.get("/api/stores/nearest", { params: { lat, lng } });
                    setNearest(data);
                    const km = Number(data?.distanciaKm);
                    setOutOfRange(Number.isFinite(km) ? km > DELIVERY_MAX_KM : false);
                  } catch {
                    setNearest(null);
                    setOutOfRange(false);
                  }
                }}
                title="Arrástrame para ajustar tu ubicación"
              />
            </GoogleMap>
          </div>
        </LoadScriptNext>
      )}

      {nearest && !nearest.error && !outOfRange && (
        <p className="pc-note">
          🧭 Tienda más cercana: <b>#{nearest.storeId}</b> (~{Number(nearest.distanciaKm).toFixed(2)} km)
        </p>
      )}
      {nearest && !nearest.error && outOfRange && (
        <div className="pc-alert">
          Estás fuera del rango de servicio (<span className="pc-badge">{DELIVERY_MAX_KM} km</span>).
          Distancia estimada: ~{Number(nearest.distanciaKm).toFixed(2)} km. Prueba con otra dirección o selecciona <b>Recoger en tienda</b>.
        </div>
      )}

      {!baseOk && triedNext && (
        <div className="pc-alert" role="alert" aria-live="polite" style={{ marginTop: 8 }}>
          Faltan <b>Nombre</b> y <b>Teléfono</b> del cliente. Toca “Datos del cliente” para completar.
        </div>
      )}

      {triedNext && !addrOk && (
        <div className="pc-alert" style={{ marginTop: 8 }}>
          La dirección debe estar dentro del área de servicio (máx {DELIVERY_MAX_KM} km).
        </div>
      )}

      <div className="pc-actions" style={{ marginTop: 10 }}>
        <button
          className={`pc-btn ${baseOk ? "pc-btn-valid" : "pc-btn-danger"} ${!baseOk && flashCus ? "pc-shake" : ""}`}
          onClick={() => setShowCus(true)}
        >
          Datos del cliente
        </button>

        <button
          className="pc-btn pc-btn-primary push"
          onClick={() => {
            if (!nextGuard()) return;
            setStep("order");
          }}
          disabled={outOfRange ? true : false}
        >
          Siguiente → productos
        </button>
      </div>

      {showCus && (
        <CustomerModal
          variant="delivery"
          initial={{ ...customer, address_1: customer?.address_1 || query, lat: coords?.lat, lng: coords?.lng }}
          onClose={() => setShowCus(false)}
          onSave={(data) => {
            setCustomer({ ...customer, ...data });
            setShowCus(false);
          }}
        />
      )}
    </div>
  );

  const pickupLocateView = (
    <div className="pc-card">
      <div className="pc-actions" style={{ marginBottom: 8 }}>
        <button
          className="pc-btn pc-btn-ghost push"
          onClick={() => {
            setMode("deliveryLocate");
            setStep("locate");
            setTriedNext(false);
          }}
        >
          cambiar a envío →
        </button>
      </div>

      <h2 className="pc-title">Elige tu tienda para recoger</h2>

      <div className="pc-grid">
        <div>
          {/* 1) MAPA */}
          <LoadScriptNext googleMapsApiKey={GOOGLE_KEY}>
            <div className="pc-map" data-noswipe>
              <GoogleMap
                center={mapCenter}
                zoom={mapZoom}
                mapContainerStyle={{ width: "100%", height: "100%" }}
                options={{ disableDefaultUI: true }}
              >
                {stores.map((s) => (
                  <Marker
                    key={s.id}
                    position={{ lat: s.latitude, lng: s.longitude }}
                    title={`${s.storeName || "Store"} #${s.id}`}
                    onClick={() => {
                      setSelectedStoreId(Number(s.id));
                      setMapCenter({ lat: s.latitude, lng: s.longitude });
                      setMapZoom(15);
                      ensureStoreAddress(s.id);
                    }}
                  />
                ))}
              </GoogleMap>
            </div>
          </LoadScriptNext>

          {/* 2) SELECT TIENDA */}
          <label className="pc-note" style={{ marginTop: 12, display: "block" }}>
            o elige de la lista:
          </label>
          <select
            className={`pc-select ${triedNext && !selectedStoreId ? "is-error" : ""}`}
            value={selectedStoreId || ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              setSelectedStoreId(id);
              const s = stores.find((x) => x.id === id);
              if (s) {
                setMapCenter({ lat: s.latitude, lng: s.longitude });
                setMapZoom(15);
              }
              ensureStoreAddress(id);
            }}
          >
            <option value="">– selecciona tienda –</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.id} — {s.storeName}
              </option>
            ))}
          </select>

          {/* Dirección textual */}
          {selectedStoreId && (
            <p className="pc-note" style={{ marginTop: 8 }}>
              <b>Dirección de la tienda:</b> {storeAddrById[selectedStoreId] || "obteniendo dirección…"}
            </p>
          )}

          {/* Errores */}
          {!baseOk && triedNext && (
            <div className="pc-alert" role="alert" aria-live="polite" style={{ marginTop: 8 }}>
              Faltan <b>Nombre</b> y <b>Teléfono</b> del cliente. Toca “Datos del cliente” para completar.
            </div>
          )}
          {triedNext && !selectedStoreId && (
            <div className="pc-alert" style={{ marginTop: 8 }}>
              Selecciona una tienda para recoger.
            </div>
          )}

          {/* Botones */}
          <div className="pc-actions" style={{ marginTop: 10 }}>
            <button
              className={"pc-btn " + (baseOk ? "pc-btn-valid" : "pc-btn-danger") + (!baseOk && flashCus ? " pc-shake" : "")}
              onClick={() => setShowCus(true)}
            >
              Datos del cliente
            </button>

            <button
              className="pc-btn pc-btn-primary push"
              onClick={() => {
                if (!nextGuard()) return;
                setStep("order");
              }}
            >
              Siguiente → productos
            </button>
          </div>
        </div>
      </div>

      {showCus && (
        <CustomerModal
          variant="pickup"
          initial={{ ...customer }}
          onClose={() => setShowCus(false)}
          onSave={(data) => {
            setCustomer({ ...customer, ...data });
            setShowCus(false);
          }}
        />
      )}
    </div>
  );

  // Paso 2: carrito
  const orderView = (
    <div className="pc-card">
      <div className="pc-actions" style={{ marginBottom: 8 }}>
        <button className="pc-btn pc-btn-ghost push" onClick={() => setStep("locate")} aria-label="Volver a seleccionar tienda/dirección">
          ← volver
        </button>
      </div>

      <LocalSaleForm
        forcedStoreId={mode === "deliveryLocate" ? Number(nearest?.storeId) : Number(selectedStoreId) || undefined}
        compact
        customer={customer}
        onConfirmCart={(data) => {
          const sid = mode === "deliveryLocate" ? Number(nearest?.storeId) : Number(selectedStoreId);
          const sel = sid ? getStoreById(sid) : null;
          const addr = sid ? storeAddrById[sid] : undefined;

          setPending({
            ...data,
            customer,
            storeId: sid ?? data.storeId,
            storeName: sel?.storeName || sel?.name || "",
            storeAddress: addr,
          });
          setStep("review");
        }}
        onDone={() => {}}
      />
    </div>
  );

  // ---------- helper: construir items válidos para la API ----------
  const buildItemsForApi = (items) =>
    (items || [])
      .map((x) => {
        const id = Number(x.pizzaId ?? x.id);
        const name = String(x.name ?? x.pizzaName ?? "").trim();
        if (Number.isFinite(id) && id > 0) return { pizzaId: id, size: x.size, qty: x.qty };
        if (name) return { name, size: x.size, qty: x.qty };
        return null;
      })
      .filter(Boolean);

  // Paso 3: review + pagar — cálculo por bloques de 5 pizzas
  const isDelivery = mode === "deliveryLocate";
  const qtyTotal = pending?.items?.reduce((s, x) => s + Number(x.qty || 0), 0) || 0;
  const deliveryBlocks = isDelivery && qtyTotal > 0 ? Math.ceil(qtyTotal / DELIVERY_BLOCK) : 0;
  const deliveryFeeTotal = isDelivery ? deliveryBlocks * DELIVERY_FEE : 0;

  const couponPct = Number(coupon?.percent || 0);
  const couponDiscount = pending ? Math.round((Number(pending.total || 0) * (couponPct / 100)) * 100) / 100 : 0;
  const reviewNetProducts = pending ? Number(pending.total || 0) - couponDiscount : 0;
  const reviewTotal = reviewNetProducts + deliveryFeeTotal;

  const startPayment = useCallback(async () => {
    if (!pending || isPaying) return;
    setIsPaying(true);
    try {
      const payload = {
        storeId: pending.storeId,
        type: isDelivery ? "DELIVERY" : "LOCAL",
        delivery: isDelivery ? "COURIER" : "PICKUP",
        channel: "WHATSAPP",
        customer: isDelivery
          ? {
              phone: customer?.phone,
              name: customer?.name,
              address_1: customer?.address_1 || query,
              lat: coords?.lat,
              lng: coords?.lng,
            }
          : { phone: customer?.phone, name: customer?.name },
        items: buildItemsForApi(pending.items),
        extras: isDelivery
          ? [
              {
                code: "DELIVERY_FEE",
                label: `Gastos de envío (${deliveryBlocks} envío${deliveryBlocks > 1 ? "s" : ""})`,
                amount: deliveryFeeTotal,
              },
            ]
          : [],
        // Solo enviamos cupón si es válido
        ...(couponOk && coupon?.code ? { coupon: coupon.code } : {}),
        notes: "",
      };

      // 1) Crear venta (AWAITING_PAYMENT)
      const { data: created } = await api.post("/api/venta/pedido", payload);

      // 2) Crear sesión de pago (pasamos id y code por robustez)
      const { data: pay } = await api.post("/api/venta/checkout-session", {
        orderId: created?.id,
        code: created?.code,
      });

      if (!pay?.url) throw new Error("No se pudo crear la sesión de pago");
      window.location.href = pay.url;
    } catch (e) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "No se pudo iniciar el pago";
      // Mensajes específicos útiles
      if (/Stripe no configurado/i.test(msg)) {
        alert("Pago no disponible (Stripe no configurado).");
      } else if (/fuera.*zona|servicio/i.test(msg)) {
        alert("La dirección está fuera del área de servicio.");
      } else {
        alert(msg);
      }
      setIsPaying(false);
    }
  }, [
    pending,
    isPaying,
    isDelivery,
    customer,
    query,
    coords,
    deliveryBlocks,
    deliveryFeeTotal,
    couponOk,
    coupon,
  ]);

  const reviewView = (
    <div className="pc-card">
      <h2 className="pc-title">Revisión del pedido</h2>
      {pending ? (
        <>
          <p>
            <b>Tienda:</b> #{pending.storeId}
            {pending.storeName ? ` — ${pending.storeName}` : ""}
          </p>
          {!isDelivery && pending.storeAddress && (
            <p>
              <b>Dirección de recogida:</b> {pending.storeAddress}
            </p>
          )}
          {customer?.name && (
            <p>
              <b>Cliente:</b> {customer.name} ({customer.phone || "-"})
            </p>
          )}
          {isDelivery && (
            <p>
              <b>Dirección:</b> {customer?.address_1 || query}
            </p>
          )}

          <table className="pc-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Item</th>
                <th>Size</th>
                <th>Qty</th>
                <th>€</th>
              </tr>
            </thead>
            <tbody>
              {pending.items.map((it, i) => {
                const unitBase = Number(it.price || 0);
                const unitExtras = (Array.isArray(it.extras) ? it.extras : []).reduce(
                  (s, e) => s + Number(e?.price || 0),
                  0
                );
                const lineTotal = (unitBase + unitExtras) * Number(it.qty || 0);
                const label = it.name && String(it.name).trim() ? it.name : `#${it.pizzaId}`;
                return (
                  <tr key={i}>
                    <td>
                      {label}
                      {Array.isArray(it.extras) && it.extras.length > 0 && (
                        <div className="pc-note">
                          + {it.extras.map((e) => `${e.name} (+€${Number(e.price || 0).toFixed(2)})`).join(", ")}
                        </div>
                      )}
                    </td>
                    <td>{it.size}</td>
                    <td style={{ textAlign: "center" }}>{it.qty}</td>
                    <td style={{ textAlign: "right" }}>{lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="pc-totals">
            <div>Subtotal: €{Number(pending.total).toFixed(2)}</div>
            {couponPct > 0 && (
              <div>
                Cupón {coupon?.code} ({couponPct}%): −€{couponDiscount.toFixed(2)}
              </div>
            )}
            {isDelivery && (
              <div>
                Gastos de envío ({deliveryBlocks} envío{deliveryBlocks > 1 ? "s" : ""} · {DELIVERY_FEE.toFixed(2)} € cada {DELIVERY_BLOCK} pizzas): €{deliveryFeeTotal.toFixed(2)}
              </div>
            )}
            <div className="pc-total">Total: €{reviewTotal.toFixed(2)}</div>
          </div>

          {isDelivery && (
            <p className="pc-note">
              Nota: el envío cuesta <b>{DELIVERY_FEE.toFixed(2)} €</b> por cada bloque de <b>{DELIVERY_BLOCK}</b> pizzas (p. ej. 7 pizzas ⇒ 2×
              {DELIVERY_FEE.toFixed(2)} €).
            </p>
          )}

          <div className="pc-actions pc-sticky" style={{ marginTop: 10 }}>
            <button className="pc-btn pc-btn-ghost" onClick={() => setStep("order")}>
              ← editar
            </button>
            <button
              className="pc-btn pc-btn-primary push"
              onClick={startPayment}
              disabled={isPaying}
            >
              {isPaying ? "Redirigiendo…" : "Pagar ahora"}
            </button>
          </div>
        </>
      ) : (
        <p>No hay carrito.</p>
      )}
    </div>
  );

  function PublicFooter() {
    return (
      <footer className="footer">
        <div className="footer__inner">
          <p className="info-text">¡Más información aquí!</p>
          <div className="social-icons">
            <a href="https://wa.me/34694301433" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp Chat">
              <FontAwesomeIcon icon={faWhatsapp} className="icon" />
            </a>
            <a href="https://www.tiktok.com/@luigiroppo?_t=ZN-8whjKa8Moxq&_r=1" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
              <FontAwesomeIcon icon={faTiktok} className="icon" />
            </a>
            <a href="tel:694301433" className="call-link" aria-label="Llamar">
              <FontAwesomeIcon icon={faMobileScreenButton} className="icon" />
            </a>
          </div>
          <p className="footer__legal">
            © {new Date().getFullYear()} MyCrushPizza SL.<br />
            Todos los derechos reservados.
          </p>
        </div>
      </footer>
    );
  }

  // === Caja de Cupón (solo portada) ===
  const CouponCard = (
    <div className="pc-card" aria-label="Cupón de descuento">
      <h3 className="pc-title pc-title-center">¿Tienes un cupón?</h3>
      <div className="pc-actions">
        <input
          className="pc-input"
          placeholder="Escribe tu código (p. ej. MCRUSH10)"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && checkCoupon()}
          aria-label="Código de cupón"
        />
        <button className="pc-btn pc-btn-primary" onClick={checkCoupon}>Aplicar</button>
        {coupon && couponOk && <span className="pc-badge" aria-live="polite">{couponMsg}</span>}
      </div>
      {!couponOk && couponMsg && <div className="pc-alert" style={{ marginTop: 8 }}>{couponMsg}</div>}
    </div>
  );

  // ========== RENDER ==========
  return (
    <div className="pc-page" onKeyDown={onKeyDown}>
      <div
        className="pc-wrap"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {mode === "choose" && chooseMode}
        {mode === "choose" && CouponCard}
        {mode === "deliveryLocate" && step === "locate" && deliveryLocateView}
        {mode === "pickupLocate" && step === "locate" && pickupLocateView}
        {step === "order" && orderView}
        {step === "review" && reviewView}
      </div>
      <PublicFooter />
    </div>
  );
}
