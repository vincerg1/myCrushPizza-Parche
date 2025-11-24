// backend VENTAS: src/lib/customers.js
'use strict';

/**
 * Crea o encuentra un cliente por teléfono.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ phone: string, name?: string|null, origin?: string|null }} opts
 */
async function findOrCreateCustomerByPhone(prisma, { phone, name = null, origin = null }) {
  const phoneRaw = String(phone || '').trim();
  if (!phoneRaw) {
    throw new Error('missing_phone');
  }

  const nameTrim   = name   ? String(name).trim()   : null;
  const originTrim = origin ? String(origin).trim().toUpperCase() : null;

  // 1) Buscar por teléfono
  let customer = await prisma.customer.findFirst({
    where: { phone: phoneRaw },
  });

  // 2) Crear si no existe
  if (!customer) {
    // código humano tipo "CUS-12345" (normalizamos patrón)
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

  // 3) Si ya existe: rellenar name / origin si venían vacíos
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
