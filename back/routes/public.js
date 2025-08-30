// back/routes/public.js
const router   = require('express').Router();
const sendSMS  = require('../utils/sendSMS');

module.exports = (prisma) => {

  /* ─────────────  GET /api/public/customer/:code  ───────────── */
  router.get('/customer/:code', async (req, res) => {
    const code = req.params.code; // p.ej. ORD-36930
    try {
      const sale = await prisma.sale.findUnique({
        where: { code },
        select: {
          code: true,
          date: true,
          deliveredAt: true,
          customerData: true, // snapshot
          customer: {         // relación (por si existe)
            select: { name: true, phone: true, address_1: true, lat: true, lng: true }
          }
        }
      });

      if (!sale) return res.status(404).json({ error: 'not found' });

      const rel  = sale.customer || {};
      const snap = sale.customerData || {};

      const name = rel.name       ?? snap.name       ?? '';
      const phone= rel.phone      ?? snap.phone      ?? '';
      const addr = rel.address_1  ?? snap.address_1  ?? snap.addr ?? '';
      const lat  = rel.lat        ?? snap.lat        ?? null;
      const lng  = rel.lng        ?? snap.lng        ?? null;

      res.json({
        orderCode  : sale.code,
        date       : sale.date,         // para cronómetro
        deliveredAt: sale.deliveredAt,  // para “Finalized 👍”
        name, phone, addr, lat, lng
      });
    } catch (e) {
      console.error('[GET /public/customer/:code]', e);
      res.status(500).json({ error: 'internal' });
    }
  });

  /* ────────  PATCH /api/public/customer/:code/delivered  ──────── */
  router.patch('/customer/:code/delivered', async (req, res) => {
    const code = req.params.code;
    try {
      const sale = await prisma.sale.update({
        where : { code },
        data  : { deliveredAt: new Date() },
        select: {
          deliveredAt : true,
          customerData: true,
          customer   : { select: { phone: true } }
        }
      });

      // SMS de confirmación de entrega (usa relación o snapshot)
      const phone = sale.customer?.phone || sale.customerData?.phone;
      if (phone) {
        sendSMS(phone, '📦 Pedido entregado. ¡Buen provecho! 🍕 myCrushPizza :)')
          .catch(err => console.error('[Twilio SMS delivered]', err.message));
      }

      res.json({ ok: true, deliveredAt: sale.deliveredAt });
    } catch (e) {
      console.error('[PATCH /public/customer/:code/delivered]', e);
      res.status(500).json({ error: 'internal' });
    }
  });

  return router;
};
