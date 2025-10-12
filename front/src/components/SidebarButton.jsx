// src/components/SidebarButton.jsx
import React from "react";
import "../styles/Backoffice.css";

export default function SidebarButton({
  label,
  active = false,
  onClick,
  group = false,   
  open  = false,   
  depth = 0       
}) {
  return (
    <button
      type="button"
      className={[
        "sidebar-btn",
        group ? "is-group" : "",
        active ? "is-active" : "",
        depth ? `depth-${depth}` : ""
      ].join(" ").trim()}
      onClick={onClick}
      aria-expanded={group ? open : undefined}
      data-open={group ? String(open) : undefined}
      data-depth={depth || 0}
    >
      {group && <span className="chev" aria-hidden="true" />}
      <span className="lbl">{label}</span>
    </button>
  );
}
