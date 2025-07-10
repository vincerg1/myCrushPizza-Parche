// src/App.jsx
import React       from "react";
import { Routes, Route } from "react-router-dom";  // ⬅ nuevo
import Backoffice  from "./components/Backoffice";
import SignIn      from "./components/SignIn";
import CustomerInfo from "./components/CustomerInfo";  // ⬅ nuevo
import { useAuth } from "./components/AuthContext";

export default function App() {
  const { auth } = useAuth();

  return (
    <Routes>
      {/* mini-página pública para repartidor */}
      <Route path="/customer/:code" element={<CustomerInfo />} />

      {/* resto de la app (protegido tras login) */}
      <Route
        path="/*"
        element={auth ? <Backoffice /> : <SignIn />}
      />
    </Routes>
  );
}
