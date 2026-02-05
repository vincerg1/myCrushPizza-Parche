// src/components/CustomerIncentiveModal.jsx
import React from "react";
import OfferCreatePanel from "./OfferCreatePanel";


export default function CustomerIncentiveModal({
  customer,
  onClose,
}) {
  // ✅ Guard clause (SIN hooks antes → ESLint feliz)
  if (!customer) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 60,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "min(960px, 96vw)",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 10px 30px rgba(0,0,0,.18)",
          padding: 20,
          display: "grid",
          gap: 14,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>
              Push customer
            </h3>
            <div
              style={{
                fontSize: 13,
                opacity: 0.7,
              }}
            >
              {customer.name || "—"} · {customer.phone || "—"}
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ marginLeft: "auto" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Context note */}
        <div
          style={{
            fontSize: 13,
            background: "#fafafa",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "8px 12px",
            lineHeight: 1.4,
          }}
        >
          This action will create a <b>reserved</b> coupon assigned
          exclusively to this customer and notify them directly via SMS.
        </div>

        {/* Offer creation – CUSTOMER mode */}
        <OfferCreatePanel
          mode="CUSTOMER"
          customer={customer}
          onDone={onClose}
        />
      </div>
    </div>
  );
}
