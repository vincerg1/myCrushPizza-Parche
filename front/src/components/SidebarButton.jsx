import React from "react";
import "../styles/Backoffice.css";

export default function SidebarButton({
  label,
  active = false,
  onClick,
  group = false,   // cabecera de grupo
  open  = false,   // estado del grupo (para la flecha)
  depth = 0        // indent para hijos
}) {
  return (
    <button
      type="button"
      className={[
        "sidebar-btn",
        active ? "is-active" : "",
        group ? "is-group" : "",
        depth ? `depth-${depth}` : ""
      ].join(" ").trim()}
      onClick={onClick}
      aria-expanded={group ? open : undefined}
    >
      {group && <span className={`chev ${open ? "open" : "closed"}`} aria-hidden />}
      <span className="lbl">{label}</span>
    </button>
  );
}
