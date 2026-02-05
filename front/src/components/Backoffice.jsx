import React, { useState, useEffect, useRef } from "react";
import SidebarButton from "./SidebarButton";
import PizzaCreator from "./PizzaCreator";
import PizzaCreatorExtras from "./PizzaCreatorExtras";
import StoreCreator from "./StoreCreator";
import IngredientForm from "./IngredientForm";
import MyOrdersGate from "./MyOrders";
import MyOffersPanel from "./MyOffersPanel";
import { useAuth } from "./AuthContext";
import CustomersPanel from "./CustomersPanel";
import OfferCreatePanel from "./OfferCreatePanel";
import OffersOverview from "./OffersOverview";
import StoreInventory from "./StoreInventory";
import MyOrdersStore from "./MyOrdersStore";
import api from "../setupAxios";
import "../styles/Backoffice.css";
import moment from "moment";
import "moment/locale/es";

const LS_KEY_SIDEBAR_W = "bo.sidebarW";
const DEFAULT_W = 220;
const MIN_W = 160;
const MAX_W = 420;

export default function Backoffice() {
  const { auth, logout } = useAuth();
  const role = auth?.role;
  const isAdmin = role === "admin";
  const [active, setActive] = useState(null);
  const [open, setOpen] = useState({ offers: false, pizzaCreator: false });
  const [sidebarW, setSidebarW] = useState(DEFAULT_W);
  const [storeActive, setStoreActive] = useState(true);
  const [savingStore, setSavingStore] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSalesToday, setShowSalesToday] = useState(false);
  const [salesToday, setSalesToday] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);

  const dragRef = useRef({ startX: 0, startW: DEFAULT_W, dragging: false });

  useEffect(() => {
    if (!showSalesToday || !auth?.storeId) return;
    setLoadingSales(true);
    api
      .get(`/api/sales/today`, { params: { storeId: auth.storeId } })
      .then(r => setSalesToday(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSalesToday([]))
      .finally(() => setLoadingSales(false));
  }, [showSalesToday, auth?.storeId]);

  useEffect(() => {
    if (!role) return;
    setActive(isAdmin ? "inventory" : "myOrders");
  }, [role, isAdmin]);

  useEffect(() => {
    const saved = Number(localStorage.getItem(LS_KEY_SIDEBAR_W));
    if (Number.isFinite(saved) && saved >= MIN_W && saved <= MAX_W) {
      setSidebarW(saved);
    }
  }, []);

  useEffect(() => {
    if (isAdmin || !auth?.storeId) return;
    api
      .get(`/api/stores/${auth.storeId}`)
      .then(r => setStoreActive(!!r.data.active))
      .catch(() => {});
  }, [isAdmin, auth?.storeId]);

  const toggleStore = async () => {
    if (savingStore || !auth?.storeId) return;
    const next = !storeActive;
    setSavingStore(true);
    try {
      await api.patch(`/api/stores/${auth.storeId}/active`, { active: next });
      setStoreActive(next);
    } finally {
      setSavingStore(false);
    }
  };

  const onDragStart = (e) => {
    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startW = sidebarW;
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  const onDragMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    setSidebarW(Math.max(MIN_W, Math.min(MAX_W, dragRef.current.startW + dx)));
  };

  const onDragEnd = () => {
    dragRef.current.dragging = false;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    localStorage.setItem(LS_KEY_SIDEBAR_W, String(sidebarW));
  };

  if (!role) return null;

  /* ───────────── STORE POS (SIN CAMBIOS) ───────────── */
  if (!isAdmin) {
    return (
      <div className="store-pos-wrapper">
        <header className="store-pos-topbar">
        <div className="store-pos-tabs">
          <button
            className="menu-btn"
            onClick={() => setShowMenu(v => !v)}
            aria-label="Menu"
          >
            ☰
          </button>

          <button className="logout-btn" onClick={logout}>
            Logout
          </button>

          <button
            className={active === "myOrders" ? "active" : ""}
            onClick={() => setActive("myOrders")}
          >
            Orders
          </button>

          <button
            className={active === "storeInventory" ? "active" : ""}
            onClick={() => setActive("storeInventory")}
          >
            Inventory
          </button>
        </div>

  <div className="app-toggle">
    <span className="app-toggle-label">
      {storeActive ? "Store open" : "Store closed"}
    </span>

    <button
      type="button"
      onClick={toggleStore}
      aria-pressed={storeActive}
      disabled={savingStore}
      className={`app-toggle-btn ${storeActive ? "on" : "off"}`}
    >
      <span className="app-toggle-knob" />
    </button>
  </div>

  {showMenu && (
    <div className="pos-menu">
      <button
        onClick={() => {
          setShowSalesToday(true);
          setShowMenu(false);
        }}
      >
        📊 Ventas de hoy
      </button>

      <button disabled title="Próximamente">
        💳 Por método de pago
      </button>

      <button disabled title="Próximamente">
        🧾 Historial
      </button>
    </div>
  )}
</header>

        <main className="store-pos-panel">
          {active === "myOrders" && <MyOrdersStore />}
          {active === "storeInventory" && <StoreInventory />}
        </main>
        <footer className="bo-footer">
          © {new Date().getFullYear()} voltaPizza · Backoffice v01
        </footer>
{/* MODAL – Ventas de hoy */}
{showSalesToday && (
  <div
    className="pt-modal-back"
    onClick={() => setShowSalesToday(false)}
  >
    <div
      className="pt-modal-card sales-today"
      onClick={(e) => e.stopPropagation()}
    >
      {/* HEADER */}
      <div className="sales-header">
        <h3>📊 Ventas de hoy</h3>
        <span className="sales-date">
          {moment().format("dddd, DD MMM")}
        </span>
      </div>

      {/* STATES */}
      {loadingSales && (
        <div className="sales-empty">
          Cargando ventas…
        </div>
      )}

      {!loadingSales && salesToday.length === 0 && (
        <div className="sales-empty">
          No hay ventas hoy
        </div>
      )}

      {/* LIST */}
      {!loadingSales && salesToday.length > 0 && (
        <div className="sales-list">
          {salesToday.map((s) => (
            <div className="sales-card" key={s.id}>
              <div className="sales-meta">
                <span className="sales-time">
                  {moment(s.date).format("HH:mm")}
                </span>
                <span className="sales-code">
                  #{s.code || s.id}
                </span>
              </div>

              <div className="sales-amount">
                {Number(
                  s.total ?? s.totalAmount ?? 0
                ).toLocaleString("es-ES", {
                  style: "currency",
                  currency: "EUR",
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FOOTER */}
      <div className="sales-footer">
        <button onClick={() => setShowSalesToday(false)}>
          Cerrar
        </button>
      </div>
    </div>
  </div>
)}


      </div>
    );
  }

  /* ───────────── ADMIN ───────────── */

  const menu = [
    { key: "inventory", label: "Inventory" },
    { key: "pizzaCreator", label: "Pizza Creator", children: [{ key: "pizzaCreator/extras", label: "Extras" }] },
    { key: "storeCreator", label: "Stores" },
    { key: "customers", label: "Customers" },
    {
      key: "offers",
      label: "Ofertas",
      children: [
        { key: "offers/sms", label: "Enviar SMS" },
        { key: "offers/create", label: "Crear ofertas" },
      ],
    },
    { key: "myOrders", label: "My Orders" },
  ];

  const panel = (() => {
    switch (active) {
      case "inventory": return <IngredientForm />;
      case "pizzaCreator": return <PizzaCreator />;
      case "pizzaCreator/extras": return <PizzaCreatorExtras />;
      case "storeCreator": return <StoreCreator />;
      case "customers": return <CustomersPanel />;
      case "offers": return <OffersOverview onNavigate={setActive} />;
      case "offers/sms": return <MyOffersPanel />;
      case "offers/create": return <OfferCreatePanel />;
      case "myOrders": return <MyOrdersGate />;
      default: return null;
    }
  })();

  return (
    <div className="backoffice-wrapper" style={{ "--sidebar-w": `${sidebarW}px` }}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="small">Admin</span>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>

        {menu.map(item =>
          !item.children ? (
            <SidebarButton
              key={item.key}
              label={item.label}
              active={active === item.key}
              onClick={() => setActive(item.key)}
            />
          ) : (
            <div key={item.key}>
              <SidebarButton
                label={item.label}
                group
                open={!!open[item.key]}
                active={active === item.key}
                onClick={() => {
                  setActive(item.key);
                  setOpen(o => ({ ...o, [item.key]: !o[item.key] }));
                }}
              />
              {open[item.key] && (
                <div className="sidebar-children">
                  {item.children.map(ch => (
                    <SidebarButton
                      key={ch.key}
                      label={ch.label}
                      depth={1}
                      active={active === ch.key}
                      onClick={() => setActive(ch.key)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </aside>

      <div className="splitter" onMouseDown={onDragStart} />

      {/* ✅ SCROLL + FOOTER DENTRO DEL PANEL */}
      <main className="panel">
        <div className="panel-scroll">
          <div className="panel-inner">
            {panel}
          </div>

          <footer className="bo-footer">
            © {new Date().getFullYear()} voltaPizza · Backoffice v01
          </footer>
        </div>
      </main>
    </div>
  );
}
