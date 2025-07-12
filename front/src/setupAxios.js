// src/setupAxios.js
import axios from "axios";          // <-- ❶ IMPORT correcto

// instancia única
const api = axios.create({
  // usa variable en producción, localhost en desarrollo
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:8080",
});

// inyecta el JWT en cada request
api.interceptors.request.use(cfg => {
  const jwt = localStorage.getItem("jwt");
  if (jwt) cfg.headers.Authorization = `Bearer ${jwt}`;
  return cfg;
});

export default api;                 // <-- ❷ EXPORT único
