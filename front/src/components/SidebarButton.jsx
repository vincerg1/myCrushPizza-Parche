import React from 'react';
import '../styles/Backoffice.css';

export default function SidebarButton({ label, onClick }) {
  return (
    <button className="sidebar-btn" onClick={onClick}>
      {label}
    </button>
  );
}
