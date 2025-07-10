// src/setupAxios.js
import axios from "axios";

const api = axios.create({
  // 1️⃣  Usa la variable en producción, o localhost en desarrollo
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:8080",
});

api.interceptors.request.use(cfg => {
  const jwt = localStorage.getItem("jwt");
  if (jwt) cfg.headers.Authorization = `Bearer ${jwt}`;
  return cfg;
});

export default api;
