// src/lib/customers.js
'use strict';

/**
 * Busca un customer por teléfono. Si no existe, lo crea.
 * - prisma: instancia de Prisma (inyectada desde fuera)
 * - params: { phone, name?, origin? }
 */
async function findOrCreateCustomerByPhone(prisma, params = {}) {
  const phoneRaw = String(params.phone || '').trim();
  if (!phoneRaw) {
    throw new Error('missing_phone');
  }

  const name   = params.name != null ? String(params.name).trim() : null;
  const origin = params.origin || null;

  // 1) Buscar por teléfono
  let customer = await prisma.customer.findFirst({
    where: { phone: phoneRaw },
  });

  if (!customer) {
    // 2) Crear si no existe
    customer = await prisma.customer.create({
      data: {
        code: `C${Date.now()}`,   // patrón único tipo C1763...
        name,
        phone: phoneRaw,
        address_1: '-',
        origin,                   // 'QR', 'PHONE', etc.
      },
    });

    console.log('[customers] CREATED', {
      id: customer.id,
      phone: customer.phone,
      origin,
    });
  } else {
    // 3) Si ya existe y viene nombre nuevo, completamos nombre vacío
    if (name && !customer.name) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: { name },
      });

      console.log('[customers] UPDATED name', {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
      });
    } else {
      console.log('[customers] FOUND', {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
      });
    }
  }

  return customer;
}

module.exports = {
  findOrCreateCustomerByPhone,
};
