// src/utils/ticketText.js
import moment from "moment";
import "moment/dist/locale/es";

/**
 * Convierte un pedido en texto plano para impresora térmica
 * (58mm, fuente monoespaciada)
 */
export function buildTicketText(order, store = {}) {
  const lines = [];

  const center = (t) => t.padStart((32 + t.length) / 2).padEnd(32);
  const sep = () => lines.push("-".repeat(32));

  const f = moment(order.date).locale("es");
  const fecha = f.format("DD/MM/YY");
  const hora  = f.format("HH:mm");

  const orderCode =
    order.code ?? `ORD-${order.id ?? ""}`;

  const customerCode =
    order.customerCode ??
    order.customer?.code ??
    (order.customerId ? `CUS-${order.customerId}` : "N/A");

  // ---- HEADER ----
  lines.push(center(store.storeName || "PIZZERÍA"));
  lines.push(center(`${fecha} ${hora}`));
  lines.push(center(customerCode));
  lines.push(center(orderCode));
  sep();

  // ---- PRODUCTS ----
  const products = Array.isArray(order.products)
    ? order.products
    : (() => {
        try { return JSON.parse(order.products || "[]"); }
        catch { return []; }
      })();

  products.forEach((p) => {
    const name = p.name || p.pizzaName || "Producto";
    const size = p.size || "";
    const qty  = p.qty ?? 1;

    lines.push(`${name} ${size} x${qty}`);

    const extras = Array.isArray(p.extras)
      ? p.extras
      : (() => {
          try { return JSON.parse(p.extras || "[]"); }
          catch { return []; }
        })();

    extras.forEach((e) => {
      const label = e.label || e.name || e.code || "extra";
      lines.push(`  + ${label}`);
    });

    if (p.notes) {
      lines.push(`  Obs: ${p.notes}`);
    }
  });

  sep();

  // ---- TOTAL ----
  const total = Number(order.total ?? 0).toFixed(2);
  lines.push(`TOTAL: ${total} €`);

  sep();

  // ---- TYPE ----
  if (order.type) {
    lines.push(center(order.type));
    sep();
  }

  // ---- FOOTER ----
  lines.push(center("Gracias por su pedido"));
  if (store.tlf) lines.push(center(`Tel: ${store.tlf}`));
  if (store.address) lines.push(center(store.address));

  // Feed final (importante en térmicas)
  lines.push("\n\n");

  return lines.join("\n");
}

