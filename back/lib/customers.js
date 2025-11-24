// src/lib/customers.js
import { prisma } from '../prisma'; // ajusta la ruta si tu prisma está en otro sitio

// Pequeño generador de código de cliente tipo CUS-XXXXXX
function generateCustomerCode() {
  const base = Math.floor(Date.now() / 1000).toString(36).toUpperCase();
  return `CUS-${base}`;
}

/**
 * Busca o crea un cliente por teléfono.
 *
 * @param {Object} params
 * @param {string|number} params.phone  Teléfono del cliente
 * @param {string|null} [params.name]   Nombre opcional
 * @param {string|null} [params.origin] Origen opcional: 'QR', 'WEB', 'PHONE', etc.
 *
 * @returns {Promise<import('@prisma/client').Customer>}
 */
export async function findOrCreateCustomerByPhone({ phone, name = null, origin = null }) {
  const phoneRaw = String(phone || '').trim();
  if (!phoneRaw) {
    throw new Error('missing_phone');
  }

  const nameRaw = name ? String(name).trim() : null;
  const originRaw = origin ? String(origin).trim() : null;

  // 1) Buscar por teléfono
  let customer = await prisma.customer.findFirst({
    where: { phone: phoneRaw },
  });

  if (!customer) {
    // 2) Crear si no existe
    customer = await prisma.customer.create({
      data: {
        code: generateCustomerCode(),
        name: nameRaw,
        phone: phoneRaw,
        address_1: '-',         // igual que usabas en direct-claim
        origin: originRaw || 'QR',
      },
    });

    console.log('[customers] customer CREATED', {
      id: customer.id,
      phone: customer.phone,
      origin: customer.origin,
    });
    return customer;
  }

  // 3) Actualizar nombre/origin si vienen y están vacíos en el cliente
  const updateData = {};
  if (nameRaw && !customer.name) {
    updateData.name = nameRaw;
  }
  if (originRaw && !customer.origin) {
    updateData.origin = originRaw;
  }

  if (Object.keys(updateData).length > 0) {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: updateData,
    });
    console.log('[customers] customer UPDATED', {
      id: customer.id,
      phone: customer.phone,
      name: customer.name,
      origin: customer.origin,
    });
  } else {
    console.log('[customers] customer FOUND', {
      id: customer.id,
      phone: customer.phone,
      name: customer.name,
      origin: customer.origin,
    });
  }

  return customer;
}
