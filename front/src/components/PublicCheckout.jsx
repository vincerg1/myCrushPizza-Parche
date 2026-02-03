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
import { faMobileScreenButton, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

const GOOGLE_KEY =
  process.env.REACT_APP_GOOGLE_KEY ||
  (typeof import.meta !== "undefined" ? import.meta.env.REACT_APP_GOOGLE_KEY : undefined);

const COUNTRY = "ES";
const DELIVERY_FEE = 2.5;
const DELIVERY_BLOCK = 5;
const DELIVERY_MAX_KM = Number(
  process.env.REACT_APP_DELIVERY_MAX_KM || process.env.DELIVERY_MAX_KM || 7
);
const STATUS_POLL_MS = 8000;

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
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState(null);
  const [nearest, setNearest] = useState(null);
  const [outOfRange, setOutOfRange] = useState(false);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 40.4168, lng: -3.7038 });
  const [mapZoom, setMapZoom] = useState(12);
  const [customer, setCustomer] = useState(null);
  const [showCus, setShowCus] = useState(false);
  const [pending, setPending] = useState(null);
  const [flashCus, setFlashCus] = useState(false);
  const [triedNext, setTriedNext] = useState(false);
  const [storeAddrById, setStoreAddrById] = useState({});
  const [isPaying, setIsPaying] = useState(false);
  const [restrictModal, setRestrictModal] = useState({
    open: false,
    reason: "",
    code: "",
    phone: ""
  });

  const checkRestriction = useCallback(async (rawPhone) => {
    const phone = (rawPhone || "").replace(/\D/g, "");
    if (!phone || phone.length < 7) {
      return { checked: true, isRestricted: 0, reason: "", code: "" };
    }

    try {
      const { data } = await api.get("/api/customers/restriction", { params: { phone } });
      const isRestrictedNum = Number(
        data?.isRestricted ??
          (typeof data?.restricted === "boolean" ? (data.restricted ? 1 : 0) : data?.restricted) ??
          0
      );
      return {
        checked: true,
        isRestricted: isRestrictedNum,
        reason: data?.reason || data?.message || "",
        code: data?.code || ""
      };
    } catch {
      // si falla el endpoint, dejamos continuar (el backend cortará si aplica)
      return { checked: true, isRestricted: 0, reason: "", code: "" };
    }
  }, []);
  const EMPTY_ADDRESS_IMG =
  "https://res.cloudinary.com/djtswalha/image/upload/v1770106549/9c3761b6-294c-429a-bbe0-825cc1f6f8bb_cvuibh.png";


  // ===== LEGALES / COOKIES =====
  const [showTermsPurchase, setShowTermsPurchase] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showCookiesPolicy, setShowCookiesPolicy] = useState(false);
  const [showCookiePrefs, setShowCookiePrefs] = useState(false);
  const [consentTick, setConsentTick] = useState(0);
  const [appAccepting, setAppAccepting] = useState(true);
  const [appClosedMsg, setAppClosedMsg] = useState("");

  // === Estado de la app ===
  useEffect(() => {
    let stop = false;
    let timer = null;

    const fetchStatus = async () => {
      try {
        const { data } = await api.get("/api/app/status", {
          headers: { "Cache-Control": "no-cache" }
        });
        setAppAccepting(!!data.accepting);
        setAppClosedMsg(data.message || "");
      } catch {}
    };

    fetchStatus();
    const loop = async () => {
      await fetchStatus();
      if (!stop) timer = setTimeout(loop, STATUS_POLL_MS);
    };
    timer = setTimeout(loop, STATUS_POLL_MS);

    const onFocus = () => fetchStatus();
    const onVis = () => {
      if (!document.hidden) fetchStatus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const CONSENT_KEY = "mcp_cookie_consent_v1";
  const getConsent = () => {
    try {
      return JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
    } catch {
      return null;
    }
  };
  const setConsent = (obj) => {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(obj));
    window.dispatchEvent(new CustomEvent("cookie-consent", { detail: obj }));
    setConsentTick((t) => t + 1);
  };
  const hasConsent = () => !!getConsent();

  // ===== helpers tienda =====
  const parseOnce = (v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  };
  const arrFrom = (v) => {
    const a = parseOnce(v);
    const b = parseOnce(a);
    return Array.isArray(b) ? b : [];
  };
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
const goToOrderStep = useCallback(async (nextCustomer) => {
  const cust = nextCustomer || customer;

  // Revalidamos reglas base
  const ok = hasBaseCustomer(cust);
  if (!ok) return;

  // Restricción telefónica (misma lógica que ya usas)
  const rchk = await checkRestriction(cust?.phone);
  if (Number(rchk?.isRestricted) === 1) {
    setRestrictModal({
      open: true,
      reason: rchk.reason || "",
      code: rchk.code || "",
      phone: cust?.phone || ""
    });
    return;
  }

  setStep("order");
}, [customer, checkRestriction]);

const handleNextClick = () => {
  setTriedNext(true);

  // 🔒 En Fase 2, avanzar SOLO se hace desde CustomerModal.onSave
  setShowCus(true);
};

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
  const [coupon, setCoupon] = useState(null); // v2
  const [couponMsg, setCouponMsg] = useState("");
  const [couponOk, setCouponOk] = useState(false);
  const [showCouponToast, setShowCouponToast] = useState(false);
  const COUPON_GROUPS = [3, 4, 4];
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [showCouponInfo, setShowCouponInfo] = useState(false);

  useEffect(() => {
    if (couponOk && coupon) setShowCouponInfo(true);
  }, [couponOk, coupon]);

  const formatCoupon = useCallback((v) => {
    const raw = (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const parts = [];
    let i = 0;
    for (const g of COUPON_GROUPS) {
      if (i >= raw.length) break;
      parts.push(raw.slice(i, i + g));
      i += g;
    }
    return parts.join("-");
  }, []);

const checkCoupon = useCallback(async () => {
  const code = (couponCode || "").trim().toUpperCase();
  if (!code) {
    setCoupon(null);
    setCouponOk(false);
    setCouponMsg("Introduce un cupón.");
    return;
  }
  try {
    const { data } = await api.get("/api/coupons/validate", {
      params: { code, _nc: Date.now() }, // rompe caché
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
    });

    if (data?.valid) {
      const c = {
        code,
        kind: data.kind, // 'AMOUNT' | 'PERCENT'
        variant: data.variant,
        percent: data.percent != null ? Number(data.percent) : undefined,
        amount: data.amount != null ? Number(data.amount) : undefined,
        maxAmount: data.maxAmount != null ? Number(data.maxAmount) : undefined,
        expiresAt: data.expiresAt || null
      };
      setCoupon(c);
      setCouponOk(true);
      setCouponMsg("Cupón aplicado");
      setShowCouponToast(
  (c.kind === "AMOUNT" && Number(c.amount || 0) > 0) ||
  (c.kind === "PERCENT" && Number(c.percent || 0) > 0)
);
    } else {
      setCoupon(null);
      setCouponOk(false);
      // Pasamos el body completo como details para cubrir activeFrom/expiresAt en raíz
      const msg = explainCouponRejection({
        reason: data?.reason,
        message: data?.message,
        details: data // <- importante
      });
      setCouponMsg(msg);
    }
  } catch {
    setCoupon(null);
    setCouponOk(false);
    setCouponMsg("No se pudo validar el cupón.");
  }
}, [couponCode]);
  // ===== PICKUP: cargar tiendas activas =====
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

  // ---- validaciones “Siguiente → productos”
  const addrOk =
    mode !== "deliveryLocate" ||
    (!!(query?.trim() || customer?.address_1?.trim()) && !!coords && !!nearest?.storeId && !outOfRange);
  const baseOk = hasBaseCustomer(customer);

  const nextGuard = () => {
    setTriedNext(true);
    if (mode === "deliveryLocate") {
      if (!baseOk) flashCustomerBtn();
      return baseOk && addrOk;
    } else {
      if (!baseOk) flashCustomerBtn();
      return baseOk && !!selectedStoreId;
    }
  };

  // =================== SWIPE NAV ===================
  const [dragX, setDragX] = useState(0);
  const tStart = useRef({ x: 0, y: 0, at: 0, target: null });
  const SWIPE_X = 70;
  const SWIPE_Y_MAX = 40;
  const EDGE = 20;
    const isInteractive = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      if (!tag) return false;
      const tagU = tag.toUpperCase();
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "LABEL"].includes(tagU)) return true;
      return el.closest?.("[data-noswipe]") ? true : false;
    };
const goBack = () => {
  // 🚫 En portada NO se permite swipe
  if (mode === "choose") return;

  // ✅ PRIORIDAD ABSOLUTA: review → order
  if (step === "review") {
    setStep("order");
    return;
  }

  // order → locate
  if (step === "order") {
    setStep("locate");
    return;
  }

  // locate → choose (solo aquí)
  if (mode === "deliveryLocate" || mode === "pickupLocate") {
    setMode("choose");
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
  const touch = e.touches[0];

  if (
    touch.clientX < EDGE ||
    window.innerWidth - touch.clientX < EDGE
  ) {
    tStart.current = { x: 0, y: 0, at: 0, target: null };
    return;
  }

  tStart.current = {
    x: touch.clientX,
    y: touch.clientY,
    at: Date.now(),
    target: e.target
  };
};
const onTouchMove = (e) => {
  if (!tStart.current.target) return;
  if (isInteractive(tStart.current.target)) return;

  const touch = e.touches[0];
  const dx = touch.clientX - tStart.current.x;
  const dy = Math.abs(touch.clientY - tStart.current.y);

if (dy < SWIPE_Y_MAX) {
  // feedback visual suave
  const clamped = Math.max(-120, Math.min(120, dx));
  setDragX(clamped * 0.25); // resistencia

  if (Math.abs(dx) > SWIPE_X) {
    e.preventDefault();
  }
}
};
const onTouchEnd = (e) => {
  if (!tStart.current.target) return;

  if (isInteractive(tStart.current.target)) {
    tStart.current.target = null;
    setDragX(0);
    return;
  }

  const changed = e.changedTouches?.[0];
  if (!changed) return;

  const dx = changed.clientX - tStart.current.x;
  const dy = Math.abs(changed.clientY - tStart.current.y);

  if (Math.abs(dx) > SWIPE_X && dy < SWIPE_Y_MAX) {
    if (dx < 0) goForward();
    else goBack();
  }

  // 🧈 reset visual suave
  setDragX(0);

  // 🔁 reset SIEMPRE
  tStart.current = { x: 0, y: 0, at: 0, target: null };
};
const onKeyDown = (e) => {
    if (e.key === "ArrowLeft") goBack();
    if (e.key === "ArrowRight") goForward();
};

  // =================== VISTAS ===================
  const flashCustomerBtn = useCallback(() => {
    setFlashCus(true);
    setTimeout(() => setFlashCus(false), 650);
  }, []);

  // ===== Modales base y legales =====
  function BaseModal({ open, title, onClose, children, width = 640, hideFooter = false, overlayClassName = "" }) {
    if (!open) return null;
    return (
      <div className={`pc-modal-overlay ${overlayClassName}`} role="dialog" aria-modal="true" onClick={onClose}>
        <div
          className="pc-modal"
          style={{ maxWidth: width, width: "90%" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pc-modal__header">
            <h3 className="pc-title" style={{ margin: 0 }}>{title}</h3>
            <button className="pc-btn pc-btn-ghost" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
          <div className="pc-modal__body">{children}</div>
          {!hideFooter && (
            <div className="pc-modal__footer">
              <button className="pc-btn pc-btn-primary" onClick={onClose}>Cerrar</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function CookieGateModal({ open, onManage, onAcceptAll, onRejectOptional }) {
    return (
      <BaseModal
        open={open}
        title="Preferencias de privacidad"
        onClose={onManage}
        width={520}
        hideFooter
        overlayClassName="pc-modal-overlay--brand"
      >
        <p>
          Usamos cookies <b>necesarias</b> para que el sitio funcione y, con tu permiso, cookies
          <b> analíticas</b>. Puedes aceptar todas, rechazar las opcionales o configurar tus
          preferencias.
        </p>
        <div className="pc-actions pc-actions--2plus1" style={{ marginTop: 8 }}>
          <button className="pc-btn" onClick={onManage}>Configurar</button>
          <button className="pc-btn" onClick={onRejectOptional}>Rechazar</button>
          <button className="pc-btn pc-btn-primary pc-btn-pulse" onClick={onAcceptAll}>
            Aceptar todo
          </button>
        </div>
      </BaseModal>
    );
  }

  function CookiePrefsModal({ open, onClose }) {
    const current = getConsent() || { necessary: true, analytics: false };
    const [analytics, setAnalytics] = useState(!!current.analytics);

    const save = () => {
      setConsent({ necessary: true, analytics });
      onClose();
    };

    return (
      <BaseModal open={open} title="Preferencias de cookies" onClose={onClose} width={560}>
        <div className="pc-card">
          <div className="pc-grid" style={{ rowGap: 8 }}>
            <div>
              <b>Necesarias</b> (siempre activas)
              <p className="pc-note">Imprescindibles para el funcionamiento básico del sitio (sesión, carrito, seguridad).</p>
            </div>
            <div>
              <label className="pc-checkbox">
                <input type="checkbox" checked disabled readOnly />
                <span>Cookies necesarias</span>
              </label>
            </div>

            <hr />

            <div>
              <b>Analíticas</b>
              <p className="pc-note">Nos ayudan a entender el uso del sitio. Se activan solo con tu consentimiento.</p>
            </div>
            <div>
              <label className="pc-checkbox">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                />
                <span>Permitir cookies analíticas</span>
              </label>
            </div>
          </div>

          <div className="pc-actions" style={{ marginTop: 12 }}>
            <button className="pc-btn" onClick={() => { setConsent({ necessary: true, analytics: false }); onClose(); }}>
              Guardar (sin analíticas)
            </button>
            <button className="pc-btn pc-btn-primary push" onClick={save}>Guardar preferencias</button>
          </div>
        </div>
      </BaseModal>
    );
  }

  function TermsPurchaseModal({ open, onClose }) {
    return (
      <BaseModal open={open} title="Términos y Condiciones de Compra" onClose={onClose}>
        <div className="pc-content">
          <p><b>MYCRUSHPIZZA, S.L.</b> — CIF <b>B-21998257</b><br />
            Plaza San Antonio 1 – Local A, 32004 Ourense (España)<br />
            Registro Mercantil de Ourense: Hoja OR-18935, inscripción 1ª · IRUS: 1000451056147<br />
            Tel.: +34 694 301 433 · Email: <a href="mailto:mycrushpizzaspain@gmail.com">mycrushpizzaspain@gmail.com</a>
          </p>

          <h4>1. Productos e información</h4>
          <p>Descripciones, alérgenos, precios y fotos buscan ser exactos; pequeñas variaciones no afectan a la naturaleza del producto. Consulta alérgenos antes de confirmar.</p>

          <h4>2. Precios, impuestos y gastos</h4>
          <p>Precios en euros e incluyen IVA salvo indicación. Gastos de envío (si aplican) se calculan en el checkout.</p>

          <h4>3. Códigos promocionales y cupones</h4>
          <p>No acumulables salvo indicación. Deben aplicarse en el checkout.</p>

          <h4>4. Proceso de pedido</h4>
          <p>Selección → dirección/tienda → confirmación → pago. El contrato se perfecciona con la confirmación del pedido.</p>

          <h4>5. Disponibilidad</h4>
          <p>Si se agota un producto tras confirmar, contactaremos para reembolso, alternativa o reprogramación.</p>

          <h4>6. Áreas y condiciones de entrega</h4>
          <p>Reparto solo dentro del área de servicio indicada en el checkout. Gastos: {DELIVERY_FEE.toFixed(2)} € por cada bloque de {DELIVERY_BLOCK} pizzas (p. ej., 7 pizzas ⇒ 2 × {DELIVERY_FEE.toFixed(2)} €).</p>

          <h4>7. Recogida en tienda</h4>
          <p>Presentarse a la hora estimada y mostrar el número de pedido.</p>

          <h4>8. Pago</h4>
          <p>Pago con tarjeta a través de pasarela certificada (p. ej., Stripe). Aplicamos verificaciones antifraude automáticas.</p>

          <h4>9. Factura</h4>
          <p>Solicítala respondiendo a la confirmación o por email con tus datos fiscales.</p>

          <h4>10. Desistimiento y cancelaciones</h4>
          <p>Alimentos preparados/perecederos: no aplica desistimiento de 14 días. Cancelación gratuita posible antes de iniciar la preparación.</p>

          <h4>11. Devoluciones e incidencias</h4>
          <p>Comunícanos en 24 h con nº de pedido y, si procede, fotos. Ofrecemos reposición, vale o reembolso proporcional según el caso.</p>

          <h4>12. Responsabilidad</h4>
          <p>No respondemos por fallos de red/terceros. Nada limita derechos imperativos del consumidor.</p>

          <h4>13. Alérgenos y seguridad alimentaria</h4>
          <p>Información disponible. Puede haber trazas por instalaciones compartidas.</p>

          <h4>14. Atención al cliente y reclamaciones</h4>
          <p>Tel.: +34 694 301 433 · Email: mycrushpizzaspain@gmail.com. Hojas de Reclamaciones en el local. ODR UE: <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noreferrer">Plataforma ODR</a>.</p>

          <h4>15. Protección de datos</h4>
          <p>Se rige por la Política de Privacidad del portal.</p>

          <h4>16. Modificaciones</h4>
          <p>Podemos actualizar estas condiciones; aplican desde su publicación.</p>

          <h4>17. Ley aplicable y jurisdicción</h4>
          <p>Ley española. Fuero: Ourense (sin perjuicio de derechos imperativos).</p>

          <p className="pc-note">Última actualización: {new Date().toLocaleDateString("es-ES")}</p>
        </div>
      </BaseModal>
    );
  }

  function PrivacyPolicyModal({ open, onClose }) {
    return (
      <BaseModal open={open} title="Política de Privacidad — Portal de ventas" onClose={onClose}>
        <div className="pc-content">
          <p><b>Responsable</b><br />
            MYCRUSHPIZZA, S.L. — CIF B-21998257<br />
            Plaza San Antonio 1 – Local A, 32004 Ourense (España)<br />
            Registro Mercantil de Ourense: Hoja OR-18935, inscripción 1ª · IRUS: 1000451056147<br />
            Tel.: +34 694 301 433 · Email: <a href="mailto:mycrushpizzaspain@gmail.com">mycrushpizzaspain@gmail.com</a>
          </p>

          <h4>1) Datos que tratamos</h4>
          <ul>
            <li><b>Identificativos y contacto:</b> nombre, teléfono, email.</li>
            <li><b>Dirección y ubicación:</b> dirección postal; coordenadas aproximadas si usas mapa/autocompletado.</li>
            <li><b>Pedido y facturación:</b> productos, importe, método de entrega; NIF si solicitas factura.</li>
            <li><b>Comunicaciones de servicio:</b> avisos por WhatsApp/email sobre tu pedido.</li>
            <li><b>Técnicos:</b> IP, cookies/consentimiento, navegador/dispositivo, registros antifraude.</li>
            <li><b>Pago:</b> <u>no tratamos números completos de tarjeta</u>. El pago se procesa en la <b>pasarela</b> (p. ej., Stripe); recibimos solo confirmaciones/tokens y metadatos (estado, importe, hora).</li>
          </ul>

          <h4>2) Finalidades y bases jurídicas</h4>
          <table className="pc-table">
            <thead><tr><th>Finalidad</th><th>Base legal (RGPD)</th><th>Conservación</th></tr></thead>
            <tbody>
              <tr><td>Gestionar pedido, cobro, entrega/recogida y soporte</td><td>Ejecución del contrato (6.1.b)</td><td>Pedido+soporte hasta 24 meses; contable/fiscal 6 años</td></tr>
              <tr><td>Facturación y obligaciones legales</td><td>Obligación legal (6.1.c)</td><td>Plazos legales</td></tr>
              <tr><td>Prevención del fraude y seguridad</td><td>Interés legítimo (6.1.f)</td><td>12–24 meses</td></tr>
              <tr><td>Comunicaciones comerciales</td><td>Consentimiento (6.1.a)</td><td>Hasta retirada</td></tr>
              <tr><td>Analítica (cookies no esenciales)</td><td>Consentimiento (6.1.a)</td><td>Hasta 24 meses</td></tr>
            </tbody>
          </table>

          <h4>3) Destinatarios</h4>
          <ul>
            <li><b>Pasarela de pago</b> (p. ej., Stripe Payments Europe, Ltd.).</li>
            <li><b>Alojamiento y proveedores IT</b> (hosting, backups, correo, mensajería transaccional).</li>
            <li><b>Mensajería/Comunicación</b> (WhatsApp Business si se usa).</li>
            <li><b>Servicios de mapas</b> (Google Maps/Places) para autocompletar/ubicación).</li>
            <li><b>Tiendas propias y/o repartidores</b> para preparar/entregar el pedido.</li>
            <li>Administraciones y FCSE cuando exista obligación legal.</li>
          </ul>

          <h4>4) Transferencias internacionales</h4>
          <p>Con proveedores como Google o Stripe pueden darse transferencias bajo Cláusulas Contractuales Tipo (SCC) u otras garantías RGPD.</p>

          <h4>5) Derechos</h4>
          <p>Acceso, rectificación, supresión, oposición, limitación y portabilidad en <a href="mailto:mycrushpizzaspain@gmail.com">mycrushpizzaspain@gmail.com</a> o por correo postal, adjuntando documento identificativo. Reclamación ante la AEPD (www.aepd.es).</p>

          <h4>6) Seguridad</h4>
          <p>Medidas técnicas y organizativas apropiadas. <b>No almacenamos datos completos de tarjeta</b>; los gestiona la pasarela certificada.</p>

          <h4>7) Menores</h4>
          <p>Compras dirigidas a mayores de 18 años.</p>

          <h4>8) Cookies</h4>
          <p>Consulta la Política de Cookies para detalles y gestión del consentimiento.</p>

          <p className="pc-note">Última actualización: {new Date().toLocaleDateString("es-ES")}</p>
        </div>
      </BaseModal>
    );
  }

  function CookiesPolicyModal({ open, onClose }) {
    return (
      <BaseModal open={open} title="Política de Cookies" onClose={onClose}>
        <div className="pc-content">
          <h4>1. ¿Qué son las cookies?</h4>
          <p>Archivos que el navegador guarda para recordar información de tu visita. Usamos cookies necesarias y, con tu consentimiento, analíticas (y, si se habilitan, de publicidad).</p>

          <h4>2. Cookies que utilizamos</h4>
          <table className="pc-table">
            <thead><tr><th>Tipo</th><th>Nombre</th><th>Finalidad</th><th>Duración</th><th>Titular</th></tr></thead>
            <tbody>
              <tr><td>Técnicas (esenciales)</td><td>mcp_session</td><td>Sesión, carrito, flujo</td><td>24 h</td><td>Propia</td></tr>
              <tr><td>Preferencias</td><td>mcp_termsAccepted</td><td>Recordar aceptación de condiciones</td><td>12 meses</td><td>Propia</td></tr>
              <tr><td>Preferencias</td><td>mcp_cookie_consent_v1</td><td>Guardar tu consentimiento</td><td>12 meses</td><td>Propia</td></tr>
              <tr><td>Técnicas de terceros (pago)</td><td>__stripe_mid, __stripe_sid</td><td>Fraude/seguridad del pago</td><td>hasta 1 año / sesión</td><td>Stripe</td></tr>
              <tr><td>Técnicas de terceros (mapas)</td><td>NID, AEC (u otras)</td><td>Autocompletado/seguridad</td><td>según proveedor</td><td>Google</td></tr>
              <tr><td>Analíticas (opcionales)</td><td>_ga</td><td>Métricas de uso (Google Analytics)</td><td>24 meses</td><td>Google</td></tr>
              <tr><td>Analíticas (opcionales)</td><td>_gid</td><td>Métricas de uso (Google Analytics)</td><td>24 h</td><td>Google</td></tr>
            </tbody>
          </table>

          <h4>3. Cambiar o retirar el consentimiento</h4>
          <p>Puedes modificar tu elección en «Preferencias de cookies» en cualquier momento. El borrado de cookies desde el navegador puede resetear tus preferencias.</p>

          <h4>4. Transferencias internacionales</h4>
          <p>Con proveedores como Google o Stripe pueden darse transferencias bajo Cláusulas Contractuales Tipo (SCC) u otras garantías RGPD.</p>

          <h4>5. Contacto</h4>
          <p>mycrushpizzaspain@gmail.com</p>

          <p className="pc-note">Última actualización: {new Date().toLocaleDateString("es-ES")}</p>
        </div>
      </BaseModal>
    );
  }

  function RestrictionModal({ open, info, onClose }) {
    if (!open) return null;
    const msg = info?.reason || "No podemos continuar con este número.";
    const ref = info?.code ? `Ref.: ${info.code}` : "";
    const waText = encodeURIComponent(
      `Hola, tengo restringido mi número ${info?.phone || ""}. ${ref}`.trim()
    );

    return (
      <BaseModal
        open={open}
        title="Acceso restringido"
        onClose={onClose}
        width={520}
        hideFooter
        overlayClassName="pc-modal-overlay--danger"
      >
        <div className="pc-content">
          <p className="pc-lead" style={{display:"flex",alignItems:"center",gap:8}}>
            <FontAwesomeIcon icon={faTriangleExclamation} />
            {msg}
          </p>
          {ref && <p className="pc-note" style={{marginTop:-6}}>{ref}</p>}

          <div className="pc-actions" style={{ marginTop: 12 }}>
            <a
              className="pc-btn pc-btn-primary push"
              href={`https://wa.me/34694308757?text=${waText}`}
              target="_blank" rel="noopener noreferrer"
            >
              Contactar soporte
            </a>
          </div>
        </div>
      </BaseModal>
    );
  }

  // ===== Modal de cupón con contador destacado =====
  function CouponInfoModal({ open, onClose, data }) {
    const [countdown, setCountdown] = useState("");
    const [secondsLeft, setSecondsLeft] = useState(null);

    useEffect(() => {
      if (!open || !data?.expiresAt) return;
      let t = null;
      const tick = () => {
        const leftMs = Math.max(0, new Date(data.expiresAt).getTime() - Date.now());
        const sLeft = Math.floor(leftMs / 1000);
        setSecondsLeft(sLeft);

        const h = Math.floor(sLeft / 3600);
        const m = Math.floor((sLeft % 3600) / 60);
        const s = sLeft % 60;
        setCountdown(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        );
      };
      tick();
      t = setInterval(tick, 1000);
      return () => clearInterval(t);
    }, [open, data?.expiresAt]);

    if (!open || !data) return null;

    const severity =
      secondsLeft == null ? "ok" :
      secondsLeft <= 15 * 60 ? "critical" :
      secondsLeft <= 2 * 60 * 60 ? "warning" : "ok";

    const variant =
      secondsLeft != null && secondsLeft > 6 * 60 * 60 ? "compact" : "normal";

    const expiresDate = data.expiresAt ? new Date(data.expiresAt) : null;

    // Texto de beneficio según el tipo del cupón
    const benefitText =
      data.kind === "AMOUNT"
        ? `Descuento fijo (−€${Number(data.amount || 0).toFixed(2)})`
        : `Descuento ${Number(data.percent || 0)}%${
            data.maxAmount != null ? ` (tope €${Number(data.maxAmount).toFixed(2)})` : ""
          }`;

    return (
      <BaseModal open={open} title="Condiciones de la oferta" onClose={onClose} width={560} hideFooter>
        <div className="pc-content">
          <p style={{ marginBottom: 6 }}>
            <b>Cupón:</b> <code>{data.code}</code>
          </p>

          <p style={{ marginTop: 0 }}>
            <b>Beneficio:</b> {benefitText}
          </p>

          {expiresDate && (
            <>
              <p style={{ marginBottom: 10 }}>
                <b>Caduca:</b> {expiresDate.toLocaleString("es-ES")}
              </p>
              <div
                className={`pc-timer pc-timer--${variant} pc-timer--${severity}`}
                role="status"
                aria-live="polite"
              >
                <div className="pc-timer__label">Quedan</div>
                <div className="pc-timer__value">{countdown || "--:--:--"}</div>
              </div>
            </>
          )}

          <h4>Condiciones</h4>
          <ul>
            <li>Válido por <b>1 uso</b> y <b>no acumulable</b> con otros cupones.</li>
            <li>Se aplica sobre <b>productos</b> (no sobre gastos de envío).</li>
            <li>Vigencia: <b>24&nbsp;h desde que lo obtuviste</b> (mini-juego).</li>
            <li>El cupón se marca como usado al confirmar el pago.</li>
          </ul>

          <div className="pc-actions" style={{ marginTop: 12 }}>
            <button className="pc-btn" onClick={onClose}>Entendido</button>
            <button
              className="pc-btn pc-btn-ghost push"
              onClick={() => {
                // estas setters existen en el componente padre
                setCoupon(null);
                setCouponOk(false);
                setCouponCode("");
                setCouponMsg("");
                onClose();
              }}
            >
              Quitar cupón
            </button>
          </div>
        </div>
      </BaseModal>
    );
  }
  // Paso 0: escoger modo
const chooseMode = (
  <div className="pc-card pc-card--hero pc-hero-new">

    {/* CONTENEDOR BLANCO REAL */}
    <div className="pc-hero-whiteBox">

      {/* LOGO */}
      <div className="pc-hero-logoInner">
        <img src={logo} alt="MyCrushPizza" />
      </div>

      {/* PREGUNTA */}
      <h2 className="pc-hero-question">
        ¿Cómo quieres tu pedido?
      </h2>

      {/* BOTONES */}
      <div className="pc-hero-actions">
        <button
          className="pc-btn pc-hero-btn"
          onClick={() => {
            setMode("pickupLocate");
            setStep("locate");
            setTriedNext(false);
          }}
        >
          Recoger
        </button>

        <button
          className="pc-btn pc-hero-btn"
          onClick={() => {
            setMode("deliveryLocate");
            setStep("locate");
            setTriedNext(false);
          }}
        >
          Domi
        </button>
      </div>

    </div>

    {/* OFERTAS (FUERA DEL BLANCO) */}
    <div
      className="pc-hero-offers"
      onClick={() => window.location.href = "https://juego.mycrushpizza.com/"}
      role="button"
      aria-label="Ver ofertas"
    >
      OFERTAS
    </div>

  </div>
);

  const deliveryLocateView = (
    <div className="pc-card">
      <div className="pc-actions pc-actions-nav" style={{ marginBottom: 8 }}>
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
      {!coords && (
        <div className="pc-empty-address">
          <img
            src={EMPTY_ADDRESS_IMG}
            alt="No sabemos dónde vives"
            className="pc-empty-address__img"
          />
        </div>
      )}
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

      <div className="pc-actions" style={{ marginTop: 50 }}>
        <button
          className={`pc-btn ${baseOk ? "pc-btn-muted" : "pc-btn-attn pc-btn-attn-pulse"} ${!baseOk && flashCus ? "pc-shake" : ""}`}
          onClick={() => setShowCus(true)}
        >
          Datos del cliente
        </button>


      </div>

      {showCus && (
        <CustomerModal
          variant="delivery"
          initial={{ ...customer, address_1: customer?.address_1 || query, lat: coords?.lat, lng: coords?.lng }}
          onClose={() => setShowCus(false)}
          onSave={async (data) => {
          const merged = { ...customer, ...data };
          setCustomer(merged);
          setShowCus(false);
          await goToOrderStep(merged);
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
          <div className="pc-actions" style={{ marginTop: 50 }}>
            <button
              className={`pc-btn ${baseOk ? "pc-btn-muted" : "pc-btn-attn pc-btn-attn-pulse"} ${!baseOk && flashCus ? "pc-shake" : ""}`}
              onClick={() => setShowCus(true)}
            >
              Datos del cliente
            </button>
          </div>
        </div>
      </div>

      {showCus && (
        <CustomerModal
          variant="pickup"
          initial={{ ...customer }}
          onClose={() => setShowCus(false)}
          onSave={async (data) => {
          const merged = { ...customer, ...data };
          setCustomer(merged);
          setShowCus(false);
          await goToOrderStep(merged);
        }}
        />
      )}
    </div>
  );


const orderView = (
  <div className="pc-fullscreen">

    {/* 🔍 ORDER BAR */}
    <div className="lsf-searchRow">
      <input
        className="pc-input"
        placeholder="🔍 Buscar ingrediente…"
        value={ingredientQuery}
        onChange={(e) => setIngredientQuery(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        style={{ flex: 1 }}
      />

      <button
        className="pc-btn pc-btn-ghost"
        onClick={() => {
          setIngredientQuery("");
          setStep("locate");
        }}
      >
        ← volver
      </button>
    </div>

    {/* 🧠 LOCAL SALE FORM */}
<LocalSaleForm
  forcedStoreId={
    mode === "deliveryLocate"
      ? Number(nearest?.storeId)
      : Number(selectedStoreId) || undefined
  }
  compact
  customer={customer}
  ingredientQuery={ingredientQuery}
  onClearIngredientQuery={() => setIngredientQuery("")}
  initialCart={step === "order" ? pending?.items : null}
onConfirmCart={(data) => {
  const sid =
    mode === "deliveryLocate"
      ? Number(nearest?.storeId)
      : Number(selectedStoreId);

  const sel = sid ? getStoreById(sid) : null;
  const addr = sid ? storeAddrById[sid] : undefined;

  setPending(prev => ({
    ...(prev || {}),          // ⬅️ conserva lo anterior si existe
    ...data,                  // ⬅️ items, total, etc
    customer,
    storeId: sid ?? data.storeId,
    storeName: sel?.storeName || sel?.name || "",
    storeAddress: addr,
  }));

  setStep("review");
}}

  onDone={() => {}}
/>


  </div>
);





  const parseJsonMaybe = (v) => {
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } }
    return v;
  };
  const toArray = (v) => {
    if (Array.isArray(v)) return v;
    if (v == null) return [];
    const p = parseJsonMaybe(v);
    if (Array.isArray(p)) return p;
    if (p && typeof p === "object") return Object.values(p).length ? Object.values(p) : [p];
    return [p];
  };
  const normalizeExtra = (e, i = 0) => ({
    code: String(e?.code ?? e?.id ?? e?.slug ?? `EXTRA_${i}`),
    label: String(e?.label ?? e?.name ?? e?.title ?? `Extra ${i + 1}`),
    amount: Number(e?.amount ?? e?.price ?? e?.value ?? 0),
  });
  const buildItemsForApi = (lines = []) =>
    (Array.isArray(lines) ? lines : [])
      .map((x) => {
        const pizzaId = Number(x?.pizzaId ?? x?.id ?? x?.productId);
        const name = String(x?.name ?? x?.pizzaName ?? "").trim();
        const size = String(x?.size ?? x?.tamano ?? "").trim();
        const qty = Number(x?.qty ?? x?.quantity ?? 1) || 1;
        const price = Number(x?.price ?? x?.unitPrice ?? x?.unit_price);
        const rawExtras = x?.extras ?? x?.extra ?? x?.toppings ?? x?.addons ?? x?.adiciones ?? [];
        const extras = toArray(rawExtras).map((e, i) => normalizeExtra(e, i));

        const item = { size, qty, extras };
        if (Number.isFinite(pizzaId) && pizzaId > 0) item.pizzaId = pizzaId;
        else if (name) item.name = name;
        if (Number.isFinite(price)) item.price = price;

        return (item.pizzaId || item.name) ? item : null;
      })
      .filter(Boolean);
const safeNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const parseOnceLocal = (v) => {
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
};
const toArrayLocal = (v) => {
  const p = parseOnceLocal(v);
  if (Array.isArray(p)) return p;
  if (p == null) return [];
  if (typeof p === "object") return Object.values(p).length ? Object.values(p) : [p];
  return [p];
};
const lineTotalWithExtras = (it) => {
  const qty = safeNumber(it?.qty ?? it?.quantity ?? 1) || 1;
  const unitBase = safeNumber(it?.price ?? it?.unitPrice ?? it?.unit_price);
  const extrasArr = toArrayLocal(it?.extras ?? it?.extra ?? it?.toppings ?? it?.addons ?? it?.adiciones);
  const unitExtras = extrasArr.reduce((s, e) => s + safeNumber(e?.price ?? e?.amount ?? e?.value), 0);
  // Si el backend ya mandó subtotal de la línea, lo respetamos
  const given = Number(it?.subtotal);
  if (Number.isFinite(given)) return given;
  return (unitBase + unitExtras) * qty;
};

const computeProductsSubtotal = (items = []) =>
  (Array.isArray(items) ? items : []).reduce((sum, it) => sum + lineTotalWithExtras(it), 0);
  // Paso 3: review + pagar
  const isDelivery = mode === "deliveryLocate";
  const qtyTotal = pending?.items?.reduce((s, x) => s + Number(x.qty || 0), 0) || 0;
  const deliveryBlocks = isDelivery && qtyTotal > 0 ? Math.ceil(qtyTotal / DELIVERY_BLOCK) : 0;
  const deliveryFeeTotal = isDelivery ? deliveryBlocks * DELIVERY_FEE : 0;

  const productsSubtotal = pending
  ? (Number.isFinite(Number(pending.total)) && Number(pending.total) > 0
      ? Number(pending.total)
      : computeProductsSubtotal(pending.items))
  : 0;

  let discountTotal = 0;
  if (coupon && couponOk && productsSubtotal > 0) {
    if (coupon.kind === "AMOUNT") {
      const amt = Number(coupon.amount || 0);
      discountTotal = Math.min(Math.max(amt, 0), productsSubtotal);
    } else if (coupon.kind === "PERCENT") {
      const pct = Math.max(0, Math.min(100, Number(coupon.percent || 0)));
      const raw = (productsSubtotal * pct) / 100;
      const cap = coupon.maxAmount != null ? Math.max(0, Number(coupon.maxAmount)) : Infinity;
      discountTotal = Math.min(raw, cap, productsSubtotal);
    }
  }

  const reviewNetProducts = Math.max(0, productsSubtotal - discountTotal);
  const reviewTotal = reviewNetProducts + deliveryFeeTotal;
// === COUPON REASONS UI (helpers de mensajes) ===

const mmToHHMM = (m) => {
  if (m == null) return null;
  const h = String(Math.floor(m / 60)).padStart(2,'0');
  const mi = String(m % 60).padStart(2,'0');
  return `${h}:${mi}`;
};
const dayShort = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function buildWindowText(details = {}) {
  const days = Array.isArray(details.daysActive) ? details.daysActive : [];
  const hours = (details.windowStart!=null || details.windowEnd!=null)
    ? ` de ${mmToHHMM(details.windowStart ?? 0)} a ${mmToHHMM(details.windowEnd ?? 24*60)}`
    : '';
  const daysTxt = days.length ? ` (solo ${days.map(d => dayShort[d] || '').filter(Boolean).join(', ')})` : '';
  return `${hours}${daysTxt}`.trim();
}

function explainCouponRejection({ reason, message, details } = {}) {
  if (message) return message; 
  const d = details || {};
  const get = (k) => d[k] ?? details?.[k];

  const f = (v) => v ? new Date(v).toLocaleString('es-ES') : null;

  switch (String(reason || '').toUpperCase()) {
    case 'NOT_FOUND':        return 'El cupón no existe.';
    case 'DISABLED':         return 'Cupón deshabilitado.';
    case 'NOT_YET_ACTIVE':   return `Cupón válido desde ${f(get('activeFrom')) || 'más tarde'}.`;
    case 'EXPIRED':          return `Cupón expiró el ${f(get('expiresAt')) || '—'}.`;
    case 'EXPIRED_OR_NOT_YET': // <- NUEVO
    case 'EXPIRED_OR_NOT_YET_ACTIVE': {
      const af = get('activeFrom');  // puede venir en raíz
      const ex = get('expiresAt');
      // Si ya tenemos ambas fechas, damos un mensaje claro
      if (af && new Date(af) > new Date()) {
        return `Cupón válido desde ${f(af)}.`;
      }
      if (ex && new Date(ex) < new Date()) {
        return `Cupón expiró el ${f(ex)}.`;
      }
      return 'Cupón fuera de vigencia.';
    }
    case 'OUT_OF_WINDOW':    return `Cupón fuera de horario${buildWindowText(d) ? ` (${buildWindowText(d)})` : ''}.`;
    case 'ALREADY_USED':     return `Cupón ya utilizado${get('usedAt') ? ` el ${f(get('usedAt'))}` : ''}.`;
    case 'USAGE_LIMIT':      return 'Se alcanzó el límite de usos del cupón.';
    case 'GAME_SHAPE':       return 'Cupón del juego inválido: debe ser de valor fijo.';
    case 'NO_DISCOUNT':      return 'El cupón no aplica a este carrito.';
    default:                 return 'Cupón inválido.';
  }
}

  const fmtEur = (n) =>
    Number(n || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

const startPayment = useCallback(async () => {
  const rchk = await checkRestriction(customer?.phone);
  if (Number(rchk?.isRestricted) === 1) {
    alert(
      "No podemos iniciar el pago con este número.\n" +
      (rchk?.reason ? `${rchk.reason}\n` : "") +
      (rchk?.code ? `Ref.: ${rchk.code}` : "")
    );
    setIsPaying(false);
    return;
  }

  if (!pending || isPaying) return;
  setIsPaying(true);

  try {
    const { data: app } = await api.get("/api/app/status");
    if (!app?.accepting) {
      alert(app?.message || "La app está cerrada. Volvemos en breve.");
      setIsPaying(false);
      return;
    }

    // Revalidar cupón justo antes de pagar (no esperamos 422 aquí)
let validCouponCode = null;
if (couponOk && coupon?.code) {
  try {
    const { data: v } = await api.get("/api/coupons/validate", {
      params: { code: coupon.code, _nc: Date.now() },
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" }
    });
    if (v?.valid) {
      validCouponCode = coupon.code;
    } else {
      setCouponOk(false);
      const friendly = explainCouponRejection({ reason: v?.reason, message: v?.message, details: v });
      setCouponMsg(friendly);
      alert(friendly + "\nPuedes continuar sin cupón.");
    }
  } catch {
    // si falla la validación, seguimos sin cupón
    setCouponOk(false);
  }
}


    const itemsForApi = buildItemsForApi(pending.items).map((it) => ({
      ...it,
      size: String(it.size || "M").trim(),
      qty: Number(it.qty) || 1,
      extras: Array.isArray(it.extras)
        ? it.extras.map((e, i) => ({
            id: Number(e?.id ?? e?.pizzaId ?? e?.productId ?? 0) || undefined,
            code: "EXTRA",
            label: String(e?.label ?? e?.name ?? e?.title ?? `Extra ${i + 1}`),
            amount: Number(e?.amount ?? e?.price ?? e?.value ?? 0),
          }))
        : [],
    }));

    if (!itemsForApi.length) {
      alert("No hay productos en el carrito.");
      setIsPaying(false);
      return;
    }

    const payload = {
      storeId: Number(pending.storeId),
      type: isDelivery ? "DELIVERY" : "LOCAL",
      delivery: isDelivery ? "COURIER" : "PICKUP",
      channel: "WHATSAPP",
      customer: isDelivery
  ? {
      phone: customer?.phone,
      name: customer?.name,
      address_1: customer?.address_1 || query,
      observations: customer?.observations ?? null, // 🔥 CLAVE
      lat: coords?.lat,
      lng: coords?.lng,
    }
  : {
      phone: customer?.phone,
      name: customer?.name,
      observations: customer?.observations ?? null, // 🔥 TAMBIÉN
    },
      items: itemsForApi,
      extras: isDelivery
        ? [{
            code: "DELIVERY_FEE",
            label: `Gastos de envío (${deliveryBlocks} envío${deliveryBlocks > 1 ? "s" : ""})`,
            amount: Number(deliveryFeeTotal) || 0,
          }]
        : [],
      ...(validCouponCode ? { coupon: validCouponCode } : {}),
      notes: "",
    };

    const { data: created } = await api.post("/api/venta/pedido", payload);
    console.log("🚨 PAYLOAD FINAL /api/venta/pedido", {
  payload,
  customerState: customer,
  hasObservations: customer?.observations,
});
    const { data: pay } = await api.post("/api/venta/checkout-session", {
      orderId: created?.id,
      code: created?.code,
    });

    if (!pay?.url) throw new Error("No se pudo crear la sesión de pago");
    window.location.href = pay.url;
  } catch (e) {
    // 422 con detalle rico del cupón desde /api/venta/pedido
    if (e?.response?.status === 422 && e?.response?.data?.error === 'INVALID_COUPON') {
      const { reason, message, details } = e.response.data;
      const friendly = explainCouponRejection({ reason, message, details });
      setCouponOk(false);
      setCouponMsg(friendly);
      alert(friendly + "\nPuedes continuar sin cupón.");
      setIsPaying(false);
      return;
    }

    const msg = e?.response?.data?.error || e?.message || "No se pudo iniciar el pago";
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
                const qty = Number(it.qty || 0);
                const unitBase  = Number(it.price ?? it.unitPrice ?? 0);
                const pOnce = (v) => (typeof v === "string" ? (()=>{ try{return JSON.parse(v)}catch{return v} })() : v);
                const extras = Array.isArray(pOnce(it.extras)) ? pOnce(it.extras) : [];
                const unitExtras = extras.reduce((s, e) => {
                  const extraPrice = Number(e.price ?? e.amount ?? 0);
                  return s + (Number.isFinite(extraPrice) ? extraPrice : 0);
                }, 0);
                const lineTotal = Number.isFinite(Number(it.subtotal))
                  ? Number(it.subtotal)
                  : (unitBase + unitExtras) * qty;

                const label =
                  (it.name && String(it.name).trim()) ? it.name :
                  (it.pizzaName && String(it.pizzaName).trim()) ? it.pizzaName :
                  (Number.isFinite(it.pizzaId) ? `#${it.pizzaId}` : "Producto");

                return (
                  <tr key={i}>
                    <td>
                      {label}
                      {extras.length > 0 && (
                        <div className="pc-note">
                          {extras.map((e, idx) => {
                            const n = String(e.name ?? e.label ?? e.code ?? "extra");
                            const p = Number(e.price ?? e.amount ?? 0);
                            return `${idx ? ", " : "+ "}${n} (+${fmtEur(p)})`;
                          }).join("")}
                        </div>
                      )}
                    </td>
                    <td>{it.size}</td>
                    <td style={{ textAlign: "center" }}>{qty}</td>
                    <td style={{ textAlign: "right" }}>{fmtEur(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

      <div className="pc-totals">
        <div>Subtotal productos: {fmtEur(productsSubtotal)}</div>

        {coupon && couponOk && discountTotal > 0 && (
          <div>
            Cupón {coupon.code}
            {coupon.kind === "PERCENT"
              ? ` (${Number(coupon.percent || 0)}%` +
                (coupon.maxAmount != null ? ` · tope ${fmtEur(Number(coupon.maxAmount))}` : "") +
                `)`
              : ` (−${fmtEur(Number(coupon.amount || 0))})`
            }
            : −{fmtEur(discountTotal)}
          </div>
        )}

        {coupon && couponOk && (
          <div>Productos tras cupón: {fmtEur(reviewNetProducts)}</div>
        )}

        {isDelivery && (
          <div>
            Gastos de envío ({deliveryBlocks} envío{deliveryBlocks > 1 ? "s" : ""} · {fmtEur(DELIVERY_FEE)} cada {DELIVERY_BLOCK} pizzas): {fmtEur(deliveryFeeTotal)}
          </div>
        )}

        <div className="pc-total">Total: {fmtEur(reviewTotal)}</div>
      </div>

          <p className="pc-note" style={{ marginTop: 8 }}>
            Pagos seguros: el cobro se realiza a través de una pasarela certificada.
            MYCRUSHPIZZA no almacena ni conoce los datos completos de tu tarjeta. =)
          </p>

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

          <p className="footer__links" style={{ marginTop: 8 }}>
            <button className="pc-link" onClick={() => setShowTermsPurchase(true)}>Términos y condiciones</button>
            {" · "}
            <button className="pc-link" onClick={() => setShowPrivacyPolicy(true)}>Privacidad</button>
            {" · "}
            <button className="pc-link" onClick={() => setShowCookiesPolicy(true)}>Política de cookies</button>
            {" · "}
            <button className="pc-link" onClick={() => setShowCookiePrefs(true)}>Preferencias de cookies</button>
          </p>
        </div>
      </footer>
    );
  }

  // === Toast Cupón ===
  const CouponToast = showCouponToast ? (
    <div
      className="pc-toast pc-toast--brand pc-toast--blink"
      role="status"
      onClick={() => setShowCouponToast(false)}
    >
      ✅ {coupon?.code} aplicado:{" "}
      {coupon?.kind === "AMOUNT"
        ? `-€${Number(coupon?.amount||0).toFixed(2)}`
        : `${Number(coupon?.percent||0)}%${coupon?.maxAmount!=null ? ` (tope €${Number(coupon.maxAmount).toFixed(2)})` : ""}`
      }
    </div>
  ) : null;

  // === Caja de Cupón (solo portada) ===
  const CouponCard = (
    <div className="pc-card" aria-label="Cupón de descuento">
      <h3 className="pc-title pc-title-center">¿Tienes un cupón?</h3>
      <div className="pc-actions" style={{ alignItems: "center", gap: 8 }}>
        <input
          className="pc-input"
          placeholder="Escribe tu código (p. ej. MCP-XXXX-YYYY)"
          value={couponCode}
          onChange={(e) => setCouponCode(formatCoupon(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && checkCoupon()}
          aria-label="Código de cupón"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={COUPON_GROUPS.reduce((a, b) => a + b, 0) + (COUPON_GROUPS.length - 1)}
        />
<button
  className="pc-btn-pc-btn-primary-cupon"
  onClick={checkCoupon}
  aria-label="Aplicar cupón"
  title="Aplicar cupón"
>
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
<path
  d="M5 13l4 4L19 7"
  stroke="white"
  strokeWidth="5"
  strokeLinecap="round"
  strokeLinejoin="round"
/>
  </svg>
</button>
        {coupon && couponOk && (
          <span className="pc-badge pc-badge--brand pc-badge--blink" aria-live="polite">
            {couponMsg}
          </span>
        )}
      </div>
      {!couponOk && couponMsg && <div className="pc-alert" style={{ marginTop: 8 }}>{couponMsg}</div>}
    </div>
  );

  // ========== RENDER ==========
  if (!appAccepting) {
    return (
      <div className="pc-page pc-closed">
        <div className="pc-closed__card" role="status" aria-live="polite">
          <div className="pc-closed__emoji" aria-hidden>PEDIDOS AL 694-301-433</div>
          <h1 className="pc-closed__title"></h1>
          <p className="pc-closed__msg">
            {"Estamos trabajando en el sitio ¡Gracias!"}
          </p>
          <p className="pc-closed__hint">Para mayor info escribenos al mycrushpizzaspain@gmail.com</p>
        </div>

        <style>{`
          .pc-closed{
            min-height:100vh; display:flex; align-items:center; justify-content:center;
            padding:24px; background:linear-gradient(180deg,#ff2e73 0%, #ff4e90 100%);
          }
          .pc-closed__card{
            width:min(86vw, 600px); text-align:center; background:#fff;
            border-radius:20px; padding:clamp(22px,4vw,32px);
            box-shadow:0 16px 40px rgba(0,0,0,.15); animation:fadeIn .25s ease;
          }
          .pc-closed__emoji{ font-size:clamp(48px,9vw,84px); line-height:1; margin-bottom:6px; }
          .pc-closed__title{
            margin:6px 0 4px; font-size:clamp(22px,3.5vw,30px); line-height:1.15; font-weight:800;
          }
          .pc-closed__msg{ margin:8px 0 2px; font-size:16px }
          .pc-closed__hint{ margin-top:6px; color:#666; font-size:12px }
          @keyframes fadeIn{from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:none}}
        `}</style>
      </div>
    );
  }

  return (
    <div className="pc-page" onKeyDown={onKeyDown} data-consent={consentTick}>
      {CouponToast}

      {/* Banner de cookies */}
      <CookieGateModal
        open={!hasConsent()}
        onManage={() => setShowCookiePrefs(true)}
        onAcceptAll={() => setConsent({ necessary: true, analytics: true })}
        onRejectOptional={() => setConsent({ necessary: true, analytics: false })}
      />

      <div
        className={`pc-wrap pc-wrap--narrow ${mode === "choose" ? "pc-wrap--hero" : ""}`}
         style={{ transform: `translateX(${dragX}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {mode === "choose" && chooseMode}
        {mode === "choose" && CouponCard}
        {mode === "deliveryLocate" && step === "locate" && deliveryLocateView}
        {mode === "pickupLocate" && step === "locate" && pickupLocateView}
        {step === "order" && (
          <div data-noswipe>
            {orderView}
          </div>
        )}
        {step === "review" && reviewView}
      </div>

      {/* Modales legales */}
      <CookiePrefsModal open={showCookiePrefs} onClose={() => setShowCookiePrefs(false)} />
      <TermsPurchaseModal open={showTermsPurchase} onClose={() => setShowTermsPurchase(false)} />
      <PrivacyPolicyModal open={showPrivacyPolicy} onClose={() => setShowPrivacyPolicy(false)} />
      <CookiesPolicyModal open={showCookiesPolicy} onClose={() => setShowCookiesPolicy(false)} />

      {/* Modal de condiciones del cupón */}
      <CouponInfoModal
        open={showCouponInfo}
        onClose={() => setShowCouponInfo(false)}
        data={coupon ? {
          code: coupon.code,
          kind: coupon.kind,
          variant: coupon.variant,
          percent: coupon.percent,
          amount: coupon.amount,
          maxAmount: coupon.maxAmount,
          expiresAt: coupon?.expiresAt || null
        } : null}
      />

      <RestrictionModal
        open={restrictModal.open}
        info={restrictModal}
        onClose={() => setRestrictModal(m => ({ ...m, open: false }))}
      />
      <PublicFooter />
    </div>
  );
}
