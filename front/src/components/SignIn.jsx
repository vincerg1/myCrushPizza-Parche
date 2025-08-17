import React, { useState } from "react";
import api from "../setupAxios";
import { useAuth } from "./AuthContext";
import "../styles/SignIn.css"; // <-- importamos nuevo CSS
import logo from "../logo/nuevoLogoMyCrushPizza.jpeg";

export default function SignIn() {
  const { login } = useAuth();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/login", { user, pass });
      login(data); // Guarda token + role
    } catch {
      setErr("❌ Usuario o contraseña inválidos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-container">
      <form onSubmit={onSubmit} className="signin-form">
        <img src={logo} alt="MyCrushPizza" className="signin-logo" />
        <h2 className="title-accent">🔐 Iniciar sesión</h2>

        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="Usuario"
          className="signin-input"
          required
        />
        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Contraseña"
          type="password"
          className="signin-input"
          required
        />

        {err && <div className="signin-error">{err}</div>}

        <button type="submit" disabled={loading} className="signin-button">
          {loading ? "Ingresando..." : "Acceder"}
        </button>
      </form>
    </div>
  );
}
