import React, { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import PendingTable from "./PendingTable";
import Ticket from "./Ticket";
import api from "../setupAxios";
import "../styles/MyOrders.css";

export default function MyOrdersStore() {
  const { auth } = useAuth();
  const storeId = auth?.storeId;

  const [storeActive, setStoreActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ───── impresión ─────
  const [printOrder, setPrintOrder] = useState(null);

  /* ───────── Load store status ───────── */
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      try {
        const { data } = await api.get(`/api/stores/${storeId}`);
        setStoreActive(!!data.active);
      } catch {
        // no bloqueamos POS
      }
    })();
  }, [storeId]);

  /* ───────── Toggle store ───────── */
  const toggleStore = async () => {
    if (saving) return;

    const next = !storeActive;
    setSaving(true);
    setError("");

    try {
      await api.patch(`/api/stores/${storeId}/active`, { active: next });
      setStoreActive(next);
    } catch (e) {
      setError(e?.response?.data?.error || "Error changing store status");
    } finally {
      setSaving(false);
    }
  };

  if (!storeId) return null;

  return (
    <div className="store-pos-wrapper">
      {error && (
        <div className="pc-alert" style={{ margin: "8px 0" }}>
          {error}
        </div>
      )}

      {/* ───────── CONTENT ───────── */}
      <PendingTable
        onPrint={(order) => setPrintOrder(order)}
      />

      {/* ───────── MODAL PRINT TICKET ───────── */}
      {printOrder && (
        <div
          className="pt-modal-back"
          onClick={() => setPrintOrder(null)}
        >
          <div
            className="pt-modal-card print-ticket"
            onClick={(e) => e.stopPropagation()}
          >
            <Ticket
              order={printOrder}
              autoPrint
            />

            <div style={{ marginTop: 16, textAlign: "center" }}>
              <button onClick={() => window.print()}>
                🖨️ Imprimir de nuevo
              </button>
              <button
                style={{ marginLeft: 12 }}
                onClick={() => setPrintOrder(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
