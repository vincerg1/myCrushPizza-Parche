// src/components/SidebarButton.jsx
import React from "react";
import "../styles/Backoffice.css";

export default function SidebarButton({
  label,
  active = false,
  onClick,
  group = false,   // si es cabecera de grupo (acordeón)
  open  = false,   // estado del grupo (abierto/cerrado)
  depth = 0        // nivel de indentación para hijos
}) {
  const isChild = depth > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={group ? open : undefined}
      className={[
        "sidebar-btn",
        group ? "is-group" : "",
        isChild ? "is-child" : "",
        active ? "is-active" : ""
      ].join(" ").trim()}
    >
      {/* caret: ▸ (cerrado) / ▾ (abierto). Para ítems no-grupo se reserva espacio con placeholder */}
      {group ? (
        <span className="caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
      ) : (
        <span className="caret placeholder" aria-hidden="true"> </span>
      )}

      <span className="label">{label}</span>
    </button>
  );
}
