import React, { useState, useEffect, useRef } from "react";
import SidebarButton   from "./SidebarButton";
import PizzaCreator    from "./PizzaCreator";
import PizzaCreatorExtras from "./PizzaCreatorExtras";
import StoreCreator    from "./StoreCreator";
import IngredientForm  from "./IngredientForm";
import MyOrdersGate    from "./MyOrders";
import MyOffersPanel   from "./MyOffersPanel";
import { useAuth }     from "./AuthContext";
import CustomersPanel from "./CustomersPanel";
import OfferCreatePanel from "./OfferCreatePanel";
import OffersOverview  from "./OffersOverview";
import "../styles/Backoffice.css";

const LS_KEY_SIDEBAR_W = "bo.sidebarW";
const DEFAULT_W = 220;
const MIN_W = 160;
const MAX_W = 420;

export default function Backoffice() {
  const { auth, logout } = useAuth();
  const role    = auth?.role;
  const isAdmin = role === "admin";

  const [active, setActive] = useState("inventory");
  const [open, setOpen] = useState({ offers: false, pizzaCreator: false });

  const [sidebarW, setSidebarW] = useState(DEFAULT_W);
  const dragRef = useRef({ startX: 0, startW: DEFAULT_W, dragging: false });

  useEffect(() => {
    if (role) setActive(isAdmin ? "inventory" : "myOrders");
  }, [role, isAdmin]);

  useEffect(() => {
    const saved = Number(localStorage.getItem(LS_KEY_SIDEBAR_W));
    if (Number.isFinite(saved) && saved >= MIN_W && saved <= MAX_W) {
      setSidebarW(saved);
    }
  }, []);

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

  const menu = [
    { key:"inventory"    , label:"Inventory"     , show:isAdmin },
    {
      key: "pizzaCreator",
      label: "Pizza Creator",
      show: isAdmin,
      children: [
        { key: "pizzaCreator/extras", label: "Extras" },
      ],
    },
    { key:"storeCreator" , label:"Store Creator" , show:isAdmin },
    { key:"customers"    , label:"Customers"     , show:isAdmin },
    {
      key: "offers",
      label: "Ofertas",
      show: isAdmin,
      children: [
        { key: "offers/sms"   , label: "Enviar SMS"   },
        { key: "offers/create", label: "Crear ofertas"},
      ],
    },
    { key:"myOrders"     , label:"My Orders"     , show:true },
  ].filter(m => m.show);

  const panel = (() => {
    switch (active) {
      case "inventory":             return <IngredientForm />;
      case "pizzaCreator":          return <PizzaCreator />;
      case "pizzaCreator/extras":   return <PizzaCreatorExtras />;
      case "storeCreator":          return <StoreCreator />;
      case "customers":             return <CustomersPanel />;
      case "offers":                return <OffersOverview onNavigate={(k)=>setActive(k)} />;
      case "offers/sms":            return <MyOffersPanel />;
      case "offers/create":         return <OfferCreatePanel />;
      case "myOrders":              return <MyOrdersGate />;
      default:                      return null;
    }
  })();

  return (
    <div className="backoffice-wrapper" style={{ "--sidebar-w": `${sidebarW}px` }}>
      <aside className={`sidebar ${!isAdmin ? "non-admin" : ""}`}>
        <div className="sidebar-head">
          <span className="small">{isAdmin ? "Admin" : auth.storeName}</span>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>

        {menu.map(item => {
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

          const hasActiveChild = item.children.some(ch => active === ch.key);
          const isOpen = !!open[item.key];
          const headerActive = active === item.key || hasActiveChild;

          return (
            <div key={item.key} className={`sidebar-group ${isOpen ? "open" : ""}`}>
              <SidebarButton
                label={item.label}
                group
                open={isOpen}
                active={headerActive}
                onClick={() => {
                  setOpen(o => {
                    const next = !o[item.key];
                    if (next) setActive(item.key);
                    return { ...o, [item.key]: next };
                  });
                }}
              />
              {isOpen && (
                <div className="sidebar-children">
                  {item.children.map(child => (
                    <SidebarButton
                      key={child.key}
                      label={child.label}
                      depth={1}
                      active={active === child.key}
                      onClick={() => {
                        setActive(child.key);
                        setOpen(o => ({ ...o, [item.key]: true }));
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </aside>

      <div
        className={`splitter${dragRef.current.dragging ? " dragging" : ""}`}
        role="separator"
        tabIndex={0}
        onMouseDown={onDragStart}
        onKeyDown={onSplitterKeyDown}
      />

      <main className="panel">
        <div className="panel-scroll">
          <div className="panel-inner">{panel}</div>
          <footer className="bo-footer">
            <span>voltaPizza • Backoffice</span>
            <span>v1.0</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
