import React, { useEffect, useMemo, useState } from "react";
import api from "../setupAxios";
import { useAuth } from "./AuthContext";
import IngredientSearch from "./IngredientSearch";
import "../styles/StoreInventory.css";

export default function StoreInventory() {
  const { auth } = useAuth();
  const storeId = auth?.storeId;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openCat, setOpenCat] = useState(null);

  // 🔍 nuevo: control de vista
  const [view, setView] = useState("inventory"); // inventory | search

  /* ───────────── LOAD ───────────── */

  const load = async () => {
    if (!storeId) return;
    setLoading(true);
    const { data } = await api.get(`/api/stores/${storeId}/ingredients`);
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [storeId]);

  /* ───────────── UPDATE (STATUS ONLY) ───────────── */

  const toggle = async (row) => {
    setSaving(true);
    try {
      await api.patch(
        `/api/stores/${storeId}/ingredients/${row.id}`,
        { active: !row.active }
      );
      await load();
    } finally {
      setSaving(false);
    }
  };

  /* ───────────── GROUP + SORT ───────────── */

  const grouped = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const cat = r.category || "SIN_CATEGORIA";
      if (!map[cat]) map[cat] = [];
      map[cat].push(r);
    });

    Object.values(map).forEach((list) =>
      list.sort((a, b) => a.name.localeCompare(b.name, "es"))
    );

    return map;
  }, [rows]);

  const orderedCategories = useMemo(() => {
    return Object.keys(grouped).sort((a, b) =>
      a.localeCompare(b, "es")
    );
  }, [grouped]);

  /* ───────────── GUARDS ───────────── */

  if (!storeId) return null;

  if (loading) {
    return <div className="storeInv-loading">Loading inventory…</div>;
  }

  /* ───────────── UI ───────────── */

return (
  <div className="storeInv">
  {/* 🔍 QUICK SEARCH */}
  {view === "inventory" && (
    <div className="storeInv-searchTop">
     <button
      className="storeInv-searchBtn"
      onClick={() => setView("search")}
      type="button"
      aria-label="Buscar ingrediente"
    >
      👁️
    </button>
    </div>
  )}

  <h2 className="storeInv-title">
    Inventory – {auth.storeName}
  </h2>

  {/* 🔍 SEARCH VIEW */}
  {view === "search" && (
    <IngredientSearch
      rows={rows}
      onToggle={toggle}
      saving={saving}
      onBack={() => setView("inventory")}
    />
  )}

  {/* … resto del inventario */}


    {/* 📦 INVENTORY VIEW */}
    {view === "inventory" &&
      orderedCategories.map((cat) => {
        const list = grouped[cat];
        const inactiveCount = list.filter((i) => !i.active).length;

        return (
          <div key={cat} className="storeInv-catCard">
            {/* CATEGORY HEADER */}
            <button
              className="storeInv-catHead"
              onClick={() =>
                setOpenCat((prev) =>
                  prev === cat ? null : cat
                )
              }
            >
              <span className="storeInv-catName">{cat}</span>
              <span className="storeInv-catCount">
                {list.length}
                {inactiveCount > 0 && (
                  <span className="storeInv-catInactive">
                    {" "}· {inactiveCount} inactive
                  </span>
                )}
              </span>
            </button>

            {/* CATEGORY CONTENT */}
            {openCat === cat && (
              <div className="storeInv-catList">
                {list.map((r) => (
                  <div
                    key={r.id}
                    className={`storeInv-row ${
                      !r.active ? "inactive" : ""
                    }`}
                  >
                    <div className="storeInv-name">
                      {r.name}
                    </div>

                    <button
                      className={`storeInv-toggle ${
                        r.active ? "on" : "off"
                      }`}
                      onClick={() => toggle(r)}
                      disabled={saving}
                    >
                      {r.active ? "ACTIVE" : "INACTIVE"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

    {saving && (
      <div className="storeInv-saving">Saving…</div>
    )}
  </div>
);

}
