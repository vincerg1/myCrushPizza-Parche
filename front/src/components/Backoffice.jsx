// src/components/Backoffice.jsx    ▸ cambios mínimos indicados con ★
import React, { useState, useEffect } from "react";
import SidebarButton   from "./SidebarButton";
import PizzaCreator    from "./PizzaCreator";
import StoreCreator    from "./StoreCreator";
import IngredientForm  from "./IngredientForm";
import MyOrdersGate    from "./MyOrders";
import { useAuth }     from "./AuthContext";
import CustomerInfo from "./CustomerInfo";
import "../styles/Backoffice.css";

export default function Backoffice() {
  const { auth, logout } = useAuth();
  const role    = auth?.role;
  const isAdmin = role === "admin";

  const [active, setActive] = useState("inventory");
  useEffect(() => {
    if (role) setActive(isAdmin ? "inventory" : "myOrders");
  }, [role, isAdmin]);

  if (!role) return null;

  const menu = [
    { key:"inventory"   , label:"📦  Inventory"    , show:isAdmin },
    { key:"pizzaCreator", label:"🍕  Pizza Creator", show:isAdmin },
    { key:"storeCreator", label:"🏪  Store Creator", show:isAdmin },
    { key:"myOrders"    , label:"🧾  My Orders"    , show:true    },
    { key:"myAwards"    , label:"🏆  My Awards"    , show:isAdmin }
  ].filter(m=>m.show);

  const panel = (() => {
    switch (active) {
      case "inventory":    return <IngredientForm />;
      case "pizzaCreator": return <PizzaCreator   />;
      case "storeCreator": return <StoreCreator   />;
      case "myOrders":     return <MyOrdersGate   />;
      case "myAwards":     return <h2>My Awards – coming soon</h2>;
      default:             return null;
    }
  })();

  return (
    <div className="backoffice-wrapper">

      {/* ───── LATERAL ───── */}
      <aside className={`sidebar ${!isAdmin ? "non-admin" : ""}`}>
        {/* cabecera con logout ★ */}
        <div className="sidebar-head">
          <span className="small">
            {isAdmin ? "Admin" : auth.storeName}
          </span>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>

        {menu.map(m => (
          <SidebarButton
            key={m.key}
            label={m.label}
            active={m.key === active}
            onClick={() => setActive(m.key)}
          />
        ))}
      </aside>

      {/* ───── CONTENIDO ───── */}
      <main className="panel">{panel}</main>
    </div>
  );
}
