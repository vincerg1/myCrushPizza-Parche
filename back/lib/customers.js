// src/lib/customers.js
'use strict';

/**
 * Busca un customer por teléfono. Si no existe, lo crea.
 * - prisma: instancia de Prisma (inyectada desde fuera)
 * - params: { phone, name?, origin?, portal? }
 *
 * IMPORTANTE:
 * - origin es enum CustomerOrigin: PHONE|WALKIN|UBER|GLOVO|QR
 * - portal es string libre para tags tipo "GAME_2"
 */
async function findOrCreateCustomerByPhone(prisma, params = {}) {
  const phoneRaw = String(params.phone || '').trim();
  if (!phoneRaw) {
    throw new Error('missing_phone');
  }

  const name   = params.name != null ? String(params.name).trim() : null;
  const origin = params.origin != null ? String(params.origin).trim() : null;
  const portal = params.portal != null ? String(params.portal).trim() : null;

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
        ...(origin ? { origin } : {}), // debe ser un valor válido del enum
        ...(portal ? { portal } : {}),
      },
    });

    console.log('[customers] CREATED', {
      id: customer.id,
      phone: customer.phone,
      origin: customer.origin,
      portal: customer.portal,
    });
  } else {
    // 3) Si ya existe, actualizaciones suaves:
    // - si llega name y no hay name, lo rellenamos
    // - si llega portal y está vacío o distinto, lo actualizamos (útil para GAME_2, etc.)
    const data = {};

    if (name && !customer.name) data.name = name;

    if (portal) {
      const curPortal = customer.portal ? String(customer.portal).trim() : '';
      if (!curPortal || curPortal !== portal) data.portal = portal;
    }

    // NOTA: no tocamos origin de un customer existente (evita cambios involuntarios)
    if (Object.keys(data).length) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data,
      });

      console.log('[customers] UPDATED', {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
        portal: customer.portal,
      });
    } else {
      console.log('[customers] FOUND', {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
        portal: customer.portal,
      });
    }
  }

  return customer;
}

module.exports = {
  findOrCreateCustomerByPhone,
};
