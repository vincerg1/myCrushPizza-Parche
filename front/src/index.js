// src/index.js
import "./setupAxios";
import React    from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";      // ⬅ nuevo
import App      from "./App";
import { AuthProvider } from "./components/AuthContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>                                      {/* router raíz */}
    <AuthProvider>
      <App/>
    </AuthProvider>
  </BrowserRouter>
);