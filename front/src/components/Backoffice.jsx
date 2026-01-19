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

  // ───── Store status (SOLO STORE) ─────
  const [storeActive, setStoreActive] = useState(true);
  const [savingStore, setSavingStore] = useState(false);

  const dragRef = useRef({ startX: 0, startW: DEFAULT_W, dragging: false });

  /* default panel por rol */
  useEffect(() => {
    if (!role) return;
    setActive(isAdmin ? "inventory" : "myOrders");
  }, [role, isAdmin]);

  /* restore sidebar width */
  useEffect(() => {
    const saved = Number(localStorage.getItem(LS_KEY_SIDEBAR_W));
    if (Number.isFinite(saved) && saved >= MIN_W && saved <= MAX_W) {
      setSidebarW(saved);
    }
  }, []);

  /* load store status (solo tienda) */
  useEffect(() => {
    if (isAdmin || !auth?.storeId) return;

    api
      .get(`/api/stores/${auth.storeId}`)
      .then(r => setStoreActive(!!r.data.active))
      .catch(() => {});
  }, [isAdmin, auth?.storeId]);

  /* toggle store (REAL) */
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

  /* splitter (ADMIN) */
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
    const next = Math.max(MIN_W, Math.min(MAX_W, dragRef.current.startW + dx));
    setSidebarW(next);
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

  /* ───────────── STORE POS LAYOUT ───────────── */
  if (!isAdmin) {
    return (
      <div className="store-pos-wrapper">
        {/* TOP BAR */}
        <header className="store-pos-topbar">
          <div className="store-pos-tabs">
           
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
        </header>

        {/* CONTENT */}
        <main className="store-pos-panel">
          {active === "myOrders" && <MyOrdersStore />}
          {active === "storeInventory" && <StoreInventory />}
        </main>
      </div>
    );
  }

  /* ───────────── ADMIN MENU ───────────── */

  const menu = [
    { key: "inventory", label: "Inventory", show: true },
    {
      key: "pizzaCreator",
      label: "Pizza Creator",
      show: true,
      children: [{ key: "pizzaCreator/extras", label: "Extras" }],
    },
    { key: "storeCreator", label: "Stores", show: true },
    { key: "customers", label: "Customers", show: true },
    {
      key: "offers",
      label: "Ofertas",
      show: true,
      children: [
        { key: "offers/sms", label: "Enviar SMS" },
        { key: "offers/create", label: "Crear ofertas" },
      ],
    },
    { key: "myOrders", label: "My Orders", show: true },
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
        open={!!open[item.key]}                 // ✅ controla expansión
        active={active === item.key}
        onClick={() =>
          setOpen(o => ({
            ...o,
            [item.key]: !o[item.key],           // ✅ toggle real
          }))
        }
      />

      {open[item.key] && (                     // ✅ render condicional
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

      <div
        className="splitter"
        onMouseDown={onDragStart}
      />

      <main className="panel">
        <div className="panel-inner">{panel}</div>
      </main>
    </div>
  );
}
