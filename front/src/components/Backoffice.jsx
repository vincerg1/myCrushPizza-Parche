// src/components/Backoffice.jsx
import React, { useState, useEffect } from "react";
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

export default function Backoffice() {
  const { auth, logout } = useAuth();
  const role    = auth?.role;
  const isAdmin = role === "admin";

  const [active, setActive] = useState("inventory");
  const [open, setOpen] = useState({ offers: true }); // control de desplegables

  useEffect(() => {
    if (role) setActive(isAdmin ? "inventory" : "myOrders");
  }, [role, isAdmin]);

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
      case "offers/sms":      return <MyOffersPanel  />;     // Enviar promo por SMS
      case "offers/create":   return <OfferCreatePanel />;   // NUEVO formulario de cupones
      case "myOrders":        return <MyOrdersGate   />;
      default:                return null;
    }
  })();

  return (
    <div className="backoffice-wrapper">
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

      {/* ───── CONTENIDO ───── */}
      <main className="panel">{panel}</main>
    </div>
  );
}
