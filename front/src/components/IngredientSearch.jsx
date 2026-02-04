import React, { useMemo, useState } from "react";
import "../styles/IngredientSearch.css";

export default function IngredientSearch({
  rows = [],
  onToggle,
  onBack,
  saving = false,
}) {
  const [query, setQuery] = useState("");

  /* ───────────── FILTER (CASE-INSENSITIVE) ───────────── */

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return rows.filter((r) =>
      r.name.toLowerCase().includes(q)
    );
  }, [rows, query]);

  /* ───────────── UI ───────────── */

  return (
    <div className="ingredientSearch">
      {/* HEADER */}
      <div className="ingredientSearch-head">
        <button
          className="ingredientSearch-back"
          onClick={onBack}
        >
          ← Volver al inventario
        </button>

        <input
          type="text"
          placeholder="Encontrar ingrediente"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* EMPTY STATE */}
      {query && results.length === 0 && (
        <div className="ingredientSearch-empty">
          No se encontraron ingredientes
        </div>
      )}

      {/* RESULTS */}
      {results.length > 0 && (
        <div className="ingredientSearch-list">
          {results.map((r) => (
            <div
              key={r.id}
              className={`ingredientSearch-row ${
                !r.active ? "inactive" : ""
              }`}
            >
              <div className="ingredientSearch-info">
                <div className="ingredientSearch-name">
                  {r.name}
                </div>
                <div className="ingredientSearch-cat">
                  {r.category || "SIN_CATEGORIA"}
                </div>
              </div>

              <button
                className={`ingredientSearch-toggle ${
                  r.active ? "on" : "off"
                }`}
                onClick={() => onToggle(r)}
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
}
