// src/index.js
import "./setupAxios";
import React    from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";     
import App      from "./App";
import { AuthProvider } from "./components/AuthContext";
import "./index.css"; 

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>                                    
    <AuthProvider>
      <App/>
    </AuthProvider>
  </BrowserRouter>
);