// back/routes/public.js
const router   = require('express').Router();
const sendSMS  = require('../utils/sendSMS');

module.exports = (prisma) => {

  /* ─────────────  GET /api/public/customer/:code  ───────────── */
router.get('/customer/:code', async (req, res) => {
  const code = req.params.code;

  try {
    const sale = await prisma.sale.findUnique({
      where: { code },
      select: {
        code: true,
        date: true,
        deliveredAt: true,
        customerData: true,
        customer: {
          select: {
            name: true,
            phone: true,
            address_1: true,
            lat: true,
            lng: true,
            observations: true
          }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({ error: 'not found' });
    }

    const rel  = sale.customer || {};
    const snap = sale.customerData || {};

    const name  = snap.name  ?? rel.name  ?? '';
    const phone = snap.phone ?? rel.phone ?? '';

    const addr =
      snap.address_1 ??
      rel.address_1 ??
      '';

    const lat = snap.lat ?? rel.lat ?? null;
    const lng = snap.lng ?? rel.lng ?? null;

    const observations =
      snap.observations ??
      rel.observations ??
      '';

    res.json({
      orderCode   : sale.code,
      date        : sale.date,
      deliveredAt : sale.deliveredAt,
      name,
      phone,
      addr,
      lat,
      lng,
      observations
    });

  } catch (e) {
    console.error('[GET /api/public/customer/:code]', e);
    res.status(500).json({ error: 'internal' });
  }
});


  /* ────────  PATCH /api/public/customer/:code/delivered  ──────── */
router.patch('/customer/:code/delivered', async (req, res) => {
  const code = req.params.code;

  try {
    const sale = await prisma.sale.update({
      where: { code },
      data : { deliveredAt: new Date() },
      select: {
        deliveredAt : true,
        customerData: true,
        customer: {
          select: { phone: true }
        }
      }
    });

    const phone =
      sale.customer?.phone ||
      sale.customerData?.phone ||
      null;

    if (phone) {
      sendSMS(
        phone,
        '📦 Pedido entregado. ¡Buen provecho! 🍕 myCrushPizza'
      ).catch(err =>
        console.error('[Twilio SMS delivered]', err.message)
      );
    }

    res.json({
      ok: true,
      deliveredAt: sale.deliveredAt
    });

  } catch (e) {
    console.error('[PATCH /api/public/customer/:code/delivered]', e);
    res.status(500).json({ error: 'internal' });
  }
});


  return router;
};
