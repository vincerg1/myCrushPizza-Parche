// backend VENTAS: src/lib/customers.js
'use strict';

// Soportamos ambos estilos de export de prisma:
//   module.exports = prisma
//   module.exports = { prisma }
const prismaModule = require('../prisma');
const prisma = prismaModule.prisma || prismaModule;

/**
 * Crea o encuentra un cliente por teléfono, normalizando:
 * - Siempre busca por phone (string trim)
 * - Si no existe, crea con un code tipo "CUS-xxxxx"
 * - Si existe y no tiene name/origin, los completa
 */
async function findOrCreateCustomerByPhone({ phone, name = null, origin = null }) {
  const phoneRaw = String(phone || '').trim();
  if (!phoneRaw) {
    throw new Error('missing_phone');
  }

  const nameTrim = name ? String(name).trim() : null;
  const originTrim = origin ? String(origin).trim().toUpperCase() : null;

  // 1) Buscar por teléfono
  let customer = await prisma.customer.findFirst({
    where: { phone: phoneRaw },
  });

  // 2) Crear si no existe
  if (!customer) {
    // código tipo "CUS-12345" (unificamos patrón humano)
    const suffix = String(Date.now()).slice(-5); // últimos 5 dígitos del timestamp
    const code = `CUS-${suffix}`;

    customer = await prisma.customer.create({
      data: {
        code,
        name: nameTrim,
        phone: phoneRaw,
        address_1: '-',
        origin: originTrim || 'QR',
      },
    });

    console.log('[customers] CREATED', {
      id: customer.id,
      code: customer.code,
      phone: customer.phone,
      origin: customer.origin,
    });

    return customer;
  }

  // 3) Si existe: completar name / origin si vienen vacíos
  const patch = {};
  if (nameTrim && !customer.name) {
    patch.name = nameTrim;
  }
  if (originTrim && !customer.origin) {
    patch.origin = originTrim;
  }

  if (Object.keys(patch).length > 0) {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: patch,
    });
    console.log('[customers] UPDATED', {
      id: customer.id,
      phone: customer.phone,
      name: customer.name,
      origin: customer.origin,
    });
  } else {
    console.log('[customers] FOUND', {
      id: customer.id,
      phone: customer.phone,
      name: customer.name,
      origin: customer.origin,
    });
  }

  return customer;
}

module.exports = {
  findOrCreateCustomerByPhone,
};
