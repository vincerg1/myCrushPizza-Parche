import React, { createContext, useContext, useState, useEffect } from "react";
import api   from "../setupAxios";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
 
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem("jwt");
    const role  = localStorage.getItem("role");
    const store = localStorage.getItem("storeName");
    const id    = localStorage.getItem("storeId");
    return token ? { token, role, storeName: store, storeId: id ? +id : null } : null;
  });

  /* helper para el login */
  const login = data => {
    localStorage.setItem("jwt",  data.token);
    localStorage.setItem("role", data.role);
    if (data.storeId)   localStorage.setItem("storeId",   data.storeId);
    if (data.storeName) localStorage.setItem("storeName", data.storeName);
    setAuth(data);
  };

  const logout = () => { localStorage.clear(); setAuth(null); };

  /* inyecta el token en TODAS las peticiones */
  useEffect(() => {
    const id = axios.interceptors.request.use(cfg => {
      if (auth?.token) cfg.headers.Authorization = `Bearer ${auth.token}`;
      return cfg;
    });
    return () => axios.interceptors.request.eject(id);
  }, [auth]);

  return <Ctx.Provider value={{ auth, login, logout }}>{children}</Ctx.Provider>;
}
