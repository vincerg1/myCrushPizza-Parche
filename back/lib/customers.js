// src/lib/customers.js
'use strict';

/**
 * Busca un customer por teléfono. Si no existe, lo crea.
 * Es IDEMPOTENTE y segura ante llamadas simultáneas.
 *
 * @param prisma
 * @param params { phone, name?, origin? }
 */
async function findOrCreateCustomerByPhone(prisma, params = {}) {
  const phoneRaw = String(params.phone || '').trim();
  if (!phoneRaw) {
    throw new Error('missing_phone');
  }

  // 🔒 Normalización mínima (solo dígitos)
  const phone = phoneRaw.replace(/\D/g, '');
  if (phone.length < 7) {
    throw new Error('invalid_phone');
  }

  const name   = params.name != null ? String(params.name).trim() : null;
  const origin = params.origin || null;

  // 1) Intentar encontrar
  let customer = await prisma.customer.findUnique({
    where: { phone },
  });

  if (customer) {
    // 1.a) Completar nombre si estaba vacío
    if (name && !customer.name) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: { name },
      });

      console.log('[customers] UPDATED name', {
        id: customer.id,
        phone,
        name,
      });
    } else {
      console.log('[customers] FOUND', {
        id: customer.id,
        phone,
        name: customer.name,
      });
    }

    return customer;
  }

  // 2) No existe → intentamos crear
  try {
    customer = await prisma.customer.create({
      data: {
        code: `C${Date.now()}`,   // suficiente como identificador humano
        phone,
        name,
        address_1: '-',          // requerido por schema
        origin: origin || undefined, // 👈 solo se fija al crear
      },
    });

    console.log('[customers] CREATED', {
      id: customer.id,
      phone,
      origin,
    });

    return customer;
  } catch (err) {
    // 3) Carrera: otro proceso lo creó antes
    // Prisma lanza error de unique constraint
    if (err.code === 'P2002') {
      const existing = await prisma.customer.findUnique({
        where: { phone },
      });

      if (existing) {
        console.log('[customers] RACE recovered', {
          id: existing.id,
          phone,
        });
        return existing;
      }
    }

    throw err;
  }
}

module.exports = {
  findOrCreateCustomerByPhone,
};
