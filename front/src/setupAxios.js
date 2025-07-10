// src/setupAxios.js
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8080",
});

api.interceptors.request.use(cfg => {
  const jwt = localStorage.getItem("jwt");
  if (jwt) cfg.headers.Authorization = `Bearer ${jwt}`;
  return cfg;
});

export default api;