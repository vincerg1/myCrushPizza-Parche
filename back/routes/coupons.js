'use strict';

const express = require('express');
const router = express.Router();

module.exports = (prisma) => {
  // GET /api/coupons/validate?code=XXXX
  router.get('/validate', async (req, res) => {
    try {
      const code = String(req.query.code || '').trim().toUpperCase();
      if (!code) return res.json({ valid: false });
      const row = await prisma.coupon.findUnique({ where: { code } });
      if (!row || row.used) return res.json({ valid: false });
      return res.json({ valid: true, percent: row.percent });
    } catch (e) {
      console.error('[coupons.validate] error', e);
      res.status(500).json({ valid: false, error: 'server' });
    }
  });

  // POST /api/coupons/redeem  { code, saleId? }
  // Marca el cupón como usado (llámalo en el webhook de pago o cuando decidas confirmar venta).
  router.post('/redeem', async (req, res) => {
    try {
      const code = String(req.body.code || '').trim().toUpperCase();
      if (!code) return res.status(400).json({ error: 'code required' });
      const row = await prisma.coupon.findUnique({ where: { code } });
      if (!row) return res.status(404).json({ error: 'not found' });
      if (row.used) return res.status(400).json({ error: 'already used' });

      const updated = await prisma.coupon.update({
        where: { code },
        data: { used: true, usedAt: new Date(), saleId: req.body.saleId ?? null }
      });
      res.json({ ok: true, percent: updated.percent });
    } catch (e) {
      console.error('[coupons.redeem] error', e);
      res.status(400).json({ error: e.message });
    }
  });

  return router;
};
