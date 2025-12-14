// src/App.js
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Backoffice from "./components/Backoffice";
import SignIn from "./components/SignIn";
import CustomerInfo from "./components/CustomerInfo";
import PublicCheckout from "./components/PublicCheckout";
import { useAuth } from "./components/AuthContext";
import PaymentResult from "./components/PaymentResult";

export default function App() {
  const { auth } = useAuth();

  // ✅ No redirigir estas rutas "legales" (sirven para Meta / compliance)
  const StaticHtmlRedirect = ({ to }) => {
    React.useEffect(() => {
      window.location.href = to;
    }, [to]);
    return null;
  };

  return (
    <Routes>
      {/* Home -> portal de ventas */}
      <Route path="/" element={<Navigate to="/venta" replace />} />

      {/* ✅ Rutas legales (si el server devuelve index.html, forzamos el .html real) */}
      <Route path="/privacy" element={<StaticHtmlRedirect to="/privacy.html" />} />
      <Route path="/terms" element={<StaticHtmlRedirect to="/terms.html" />} />
      <Route path="/data-deletion" element={<StaticHtmlRedirect to="/data-deletion.html" />} />

      {/* Flujo público de compra */}
      <Route path="/venta" element={<PublicCheckout />} />
      <Route path="/venta/result" element={<PaymentResult />} />

      {/* Mini-página pública para repartidor */}
      <Route path="/customer/:code" element={<CustomerInfo />} />

      {/* Login explícito */}
      <Route
        path="/login"
        element={auth ? <Navigate to="/admin" replace /> : <SignIn />}
      />

      {/* Backoffice protegido en /admin/* */}
      <Route
        path="/admin/*"
        element={auth ? <Backoffice /> : <Navigate to="/login" replace />}
      />

      {/* Cualquier otra ruta -> ventas */}
      <Route path="*" element={<Navigate to="/venta" replace />} />
    </Routes>
  );
}
