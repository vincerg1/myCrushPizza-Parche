// src/components/Backoffice.jsx
import React, { useState, useEffect, useRef } from "react";
import SidebarButton   from "./SidebarButton";
import PizzaCreator    from "./PizzaCreator";
import StoreCreator    from "./StoreCreator";
import IngredientForm  from "./IngredientForm";
import MyOrdersGate    from "./MyOrders";
import MyOffersPanel   from "./MyOffersPanel";     // ← Enviar SMS
import { useAuth }     from "./AuthContext";
import CustomerInfo    from "./CustomerInfo";
import "../styles/Backoffice.css";
import CustomersPanel  from "./CustomersPanel";
import OfferCreatePanel from "./OfferCreatePanel"; // ← NUEVO: Crear ofertas

const LS_KEY_SIDEBAR_W = "bo.sidebarW";
const DEFAULT_W = 220;  // más estrecho por defecto
const MIN_W = 160;
const MAX_W = 420;

export default function Backoffice() {
  const { auth, logout } = useAuth();
  const role    = auth?.role;
  const isAdmin = role === "admin";

  const [active, setActive] = useState("inventory");
  const [open, setOpen] = useState({ offers: true }); // control de desplegables

  // ancho del sidebar + drag
  const [sidebarW, setSidebarW] = useState(DEFAULT_W);
  const dragRef = useRef({ startX: 0, startW: DEFAULT_W, dragging: false });

  useEffect(() => {
    if (role) setActive(isAdmin ? "inventory" : "myOrders");
  }, [role, isAdmin]);

  // restaurar ancho guardado
  useEffect(() => {
    const saved = Number(localStorage.getItem(LS_KEY_SIDEBAR_W));
    if (Number.isFinite(saved) && saved >= MIN_W && saved <= MAX_W) {
      setSidebarW(saved);
    }
  }, []);

  // handlers drag
  const onDragStart = (e) => {
    dragRef.current.dragging = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startW = sidebarW;

    // listeners globales
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
    // UX: evita seleccionar texto durante el drag
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
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    localStorage.setItem(LS_KEY_SIDEBAR_W, String(sidebarW));
  };

  // accesibilidad básica con teclado (← →)
  const onSplitterKeyDown = (e) => {
    const step = e.shiftKey ? 20 : 10;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSidebarW((w) => Math.max(MIN_W, w - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSidebarW((w) => Math.min(MAX_W, w + step));
    }
  };

  if (!role) return null;

  // Menú con grupos (children)
  const menu = [
    { key:"inventory"    , label:"📦  Inventory"     , show:isAdmin },
    { key:"pizzaCreator" , label:"🍕  Pizza Creator" , show:isAdmin },
    { key:"storeCreator" , label:"🏪  Store Creator" , show:isAdmin },
    { key:"customers"    , label:"👥  Customers"     , show:isAdmin },

    // Grupo: Ofertas
    {
      key: "offers",
      label: "🏆  Ofertas",
      show: isAdmin,
      children: [
        { key: "offers/sms"   , label: "✉️  Enviar SMS"   },
        { key: "offers/create", label: "➕  Crear ofertas"},
      ],
    },

    { key:"myOrders"     , label:"🧾  My Orders"     , show:true    },
  ].filter(m => m.show);

  const panel = (() => {
    switch (active) {
      case "inventory":       return <IngredientForm />;
      case "pizzaCreator":    return <PizzaCreator   />;
      case "storeCreator":    return <StoreCreator   />;
      case "customers":       return <CustomersPanel />;
      case "offers/sms":      return <MyOffersPanel  />;
      case "offers/create":   return <OfferCreatePanel />;
      case "myOrders":        return <MyOrdersGate   />;
      default:                return null;
    }
  })();

  return (
    <div
      className="backoffice-wrapper"
      style={{ "--sidebar-w": `${sidebarW}px` }}
    >
      {/* ───── LATERAL ───── */}
      <aside className={`sidebar ${!isAdmin ? "non-admin" : ""}`}>
        <div className="sidebar-head">
          <span className="small">{isAdmin ? "Admin" : auth.storeName}</span>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>

        {menu.map(item => {
          // Ítems simples
          if (!item.children) {
            return (
              <SidebarButton
                key={item.key}
                label={item.label}
                active={active === item.key}
                onClick={() => setActive(item.key)}
              />
            );
          }

          // Grupos con hijos
          const isOpen = !!open[item.key];
          return (
            <div key={item.key}>
              <SidebarButton
                label={item.label}
                group
                open={isOpen}
                onClick={() => setOpen(o => ({ ...o, [item.key]: !o[item.key] }))}
              />
              {isOpen && item.children.map(child => (
                <SidebarButton
                  key={child.key}
                  label={child.label}
                  active={active === child.key}
                  depth={1}
                  onClick={() => setActive(child.key)}
                />
              ))}
            </div>
          );
        })}
      </aside>

      {/* ───── SEPARADOR (drag) ───── */}
      <div
        className={`splitter${dragRef.current.dragging ? " dragging" : ""}`}
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        title="Arrastra para ajustar el ancho"
        onMouseDown={onDragStart}
        onKeyDown={onSplitterKeyDown}
      />

      {/* ───── CONTENIDO ───── */}
      <main className="panel">{panel}</main>
    </div>
  );
}
