// src/App.js 
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Backoffice from "./components/Backoffice";
import SignIn from "./components/SignIn";
import CustomerInfo from "./components/CustomerInfo";
import PublicCheckout from "./components/PublicCheckout";
import { useAuth } from "./components/AuthContext";
import PaymentResult from "./components/PaymentResult";

// NUEVO: páginas legales SPA
import PrivacyPage from "./components/PrivacyPage";
import TermsPage from "./components/TermsPage";
import DataDeletionPage from "./components/DataDeletionPage";

export default function App() {
  const { auth } = useAuth();

  return (
    <Routes>
      {/* Páginas legales (IMPORTANTE: antes del catch-all) */}
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/data-deletion" element={<DataDeletionPage />} />

      {/* Home -> portal de ventas */}
      <Route path="/" element={<Navigate to="/venta" replace />} />

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
