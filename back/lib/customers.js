'use strict';

/**
 * Busca un customer por teléfono. Si no existe, lo crea.
 * - prisma: instancia de Prisma
 * - params: {
 *     phone,
 *     name?,
 *     origin?,
 *     portal?,
 *     observations?,   // ✅ NUEVO
 *     address_1?,
 *     lat?,
 *     lng?
 *   }
 */

async function genCustomerCode(prisma) {
  let code;
  do {
    code = 'CUS-' + Math.floor(10000 + Math.random() * 90000);
  } while (await prisma.customer.findFirst({ where: { code } }));
  return code;
}

async function findOrCreateCustomerByPhone(prisma, params = {}) {
  const phoneRaw = String(params.phone || '').trim();
  if (!phoneRaw) throw new Error('missing_phone');

  const name         = params.name ? String(params.name).trim() : null;
  const origin       = params.origin ? String(params.origin).trim() : null;
  const portal       = params.portal ? String(params.portal).trim() : null;
  const observations = params.observations
    ? String(params.observations).trim()
    : null;

  const address_1 = params.address_1 ? String(params.address_1).trim() : null;
  const lat = params.lat ?? null;
  const lng = params.lng ?? null;

  // 1) Buscar customer existente
  let customer = await prisma.customer.findFirst({
    where: { phone: phoneRaw },
  });

  if (!customer) {
    // 2) Crear customer
    customer = await prisma.customer.create({
      data: {
        code: await genCustomerCode(prisma),
        name,
        phone: phoneRaw,
        address_1: address_1 || '-',
        observations,            // ✅ CLAVE
        lat,
        lng,
        ...(origin ? { origin } : {}),
        ...(portal ? { portal } : {}),
      },
    });

    console.log('[customers] CREATED', {
      id: customer.id,
      code: customer.code,
      phone: customer.phone,
      origin: customer.origin,
      portal: customer.portal,
      observations: customer.observations,
    });

  } else {
    // 3) Actualizaciones suaves
    const data = {};

    if (name && !customer.name) data.name = name;

    if (observations && observations !== customer.observations) {
      data.observations = observations;   // ✅ CLAVE
    }

    if (address_1 && address_1 !== customer.address_1) {
      data.address_1 = address_1;
    }

    if (lat != null && lng != null) {
      data.lat = lat;
      data.lng = lng;
    }

    // portal = tag técnico (sí se puede actualizar)
    if (portal) {
      const curPortal = customer.portal ? String(customer.portal).trim() : '';
      if (!curPortal || curPortal !== portal) {
        data.portal = portal;
      }
    }

    // origin NO se toca si ya existe (correcto)
    if (Object.keys(data).length) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data,
      });

      console.log('[customers] UPDATED', {
        id: customer.id,
        code: customer.code,
        phone: customer.phone,
        observations: customer.observations,
        portal: customer.portal,
      });
    } else {
      console.log('[customers] FOUND', {
        id: customer.id,
        code: customer.code,
        phone: customer.phone,
      });
    }
  }

  return customer;
}

module.exports = {
  findOrCreateCustomerByPhone,
};
