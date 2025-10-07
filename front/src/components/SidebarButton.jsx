// src/components/SidebarButton.jsx
import React from "react";
import "../styles/Backoffice.css";

export default function SidebarButton({
  label,
  active = false,
  onClick,
  group = false,   // si es cabecera de grupo
  open  = false,   // estado del grupo
  depth = 0        // nivel de indentación para hijos
}) {
  return (
    <button
      className={[
        "sidebar-btn",
        active ? "active" : "",
        group ? "group" : "",
        depth ? `depth-${depth}` : ""
      ].join(" ").trim()}
      onClick={onClick}
      aria-expanded={group ? open : undefined}
      type="button"
    >
      {group && <span className={`chev ${open ? "open" : ""}`} aria-hidden>▸</span>}
      <span className="lbl">{label}</span>
    </button>
  );
}
