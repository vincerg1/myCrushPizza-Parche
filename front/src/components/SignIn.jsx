import React, { useState } from "react";
import api   from "../setupAxios";
import { useAuth } from "./AuthContext";

export default function SignIn() {
  const { login } = useAuth();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err,  setErr ] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async e => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/login", { user, pass });
      login(data);   // Guarda token + role
    } catch {
      setErr("❌ Usuario o contraseña inválidos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={container}>
      <form onSubmit={onSubmit} style={form}>
        <h2 style={{ marginBottom: 20 }}>🔐 Iniciar sesión</h2>

        <input
          value={user}
          onChange={e => setUser(e.target.value)}
          placeholder="Usuario"
          style={input}
          required
        />
        <input
          value={pass}
          onChange={e => setPass(e.target.value)}
          placeholder="Contraseña"
          type="password"
          style={input}
          required
        />

        {err && <div style={error}>{err}</div>}

        <button type="submit" disabled={loading} style={button}>
          {loading ? "Ingresando..." : "Acceder"}
        </button>
      </form>
    </div>
  );
}

/* ───────── estilos ───────── */
const container = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "#f2f4f8",
};

const form = {
  background: "#fff",
  padding: "40px 30px",
  borderRadius: 8,
  boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: 360,
};

const input = {
  marginBottom: 15,
  padding: "12px 14px",
  fontSize: 16,
  borderRadius: 4,
  border: "1px solid #ccc",
};

const button = {
  padding: "12px",
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 4,
  border: "none",
  background: "#4285f4",
  color: "#fff",
  cursor: "pointer",
};

const error = {
  color: "#e53935",
  marginBottom: 10,
  fontSize: 14,
};
