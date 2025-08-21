// src/App.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";
import Backoffice from "./components/Backoffice";
import SignIn from "./components/SignIn";
import CustomerInfo from "./components/CustomerInfo";
import PublicCheckout from "./components/PublicCheckout"; // ⬅️ nuevo
import { useAuth } from "./components/AuthContext";
import PaymentResult from "./components/PaymentResult";

export default function App() {
  const { auth } = useAuth();

  return (
    <Routes>
      {/* mini-página pública para repartidor (QR del ticket) */}
      <Route path="/customer/:code" element={<CustomerInfo />} />

      {/* flujo público de compra para clientes */}
      <Route path="/venta" element={<PublicCheckout />} />

      {/* resto de la app (protegido tras login) */}
      <Route path="/*" element={auth ? <Backoffice /> : <SignIn />} />
      
      <Route path="/venta/result" element={<PaymentResult />} />
    </Routes>
  );
}
