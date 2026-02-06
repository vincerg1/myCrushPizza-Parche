// utils/orderSMS.js
'use strict';

/**
 * Convención única de seguimiento
 * El frontend resolverá el estado vía /api/venta/status/:orderCode
 */
const TRACKING_BASE_URL =
  process.env.FRONT_BASE_URL
    ? `${process.env.FRONT_BASE_URL.replace(/\/$/, '')}/seguimiento`
    : 'https://www.mycrushpizza.com/seguimiento';

const firstName = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const [w] = clean.split(' ');
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
};

const trackingUrl = (orderCode) =>
  `${TRACKING_BASE_URL}/${encodeURIComponent(orderCode)}`;

/**
 * 📩 SMS — Pago confirmado
 * Se envía cuando la venta pasa a PAID
 */
function buildOrderPaidSMS({ name, orderCode }) {
  const n = firstName(name);
  const saludo = n ? `Hola ${n}, ` : 'Hola, ';
  return (
    `${saludo}tu pago ha sido procesado con éxito ✅\n` +
    `Pedido: ${orderCode}\n` +
    `Puedes seguir el estado aquí 👇\n` +
    `${trackingUrl(orderCode)}`
  );
}

/**
 * 📩 SMS — Pedido en preparación
 */
function buildOrderPreparingSMS({ name, orderCode }) {
  const n = firstName(name);
  const saludo = n ? `Hola ${n}, ` : 'Hola, ';
  return (
    `${saludo}tu pedido ${orderCode} ya está en preparación 🍕\n` +
    `Sigue el estado aquí 👇\n` +
    `${trackingUrl(orderCode)}`
  );
}

/**
 * 📩 SMS — Pedido en camino
 */
function buildOrderOnTheWaySMS({ name, orderCode }) {
  const n = firstName(name);
  const saludo = n ? `Hola ${n}, ` : 'Hola, ';
  return (
    `${saludo}tu pedido ${orderCode} va en camino 🚴‍♂️\n` +
    `Seguimiento en tiempo real 👇\n` +
    `${trackingUrl(orderCode)}`
  );
}

/**
 * 📩 SMS — Pedido entregado
 */
function buildOrderDeliveredSMS({ name, orderCode }) {
  const n = firstName(name);
  const saludo = n ? `Hola ${n}, ` : 'Hola, ';
  return (
    `${saludo}tu pedido ${orderCode} ha sido entregado 🎉\n` +
    `¡Gracias por confiar en MyCrushPizza! ❤️`
  );
}

module.exports = {
  buildOrderPaidSMS,
  buildOrderPreparingSMS,
  buildOrderOnTheWaySMS,
  buildOrderDeliveredSMS,
};
