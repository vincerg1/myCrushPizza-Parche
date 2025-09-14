'use strict';

const express = require('express');
const router = express.Router();

// Valor fijo del cupón Free Pizza
const FP_VALUE_EUR = 9.99;
const isFpCode = (code) => /^MCP-FP/i.test(String(code || ''));

module.exports = (prisma) => {
  // POST /api/coupons/assign { code, hours? }  → fija expiresAt (default 24h) si no está usado
  router.post('/assign', async (req, res) => {
    try {
      const code  = String(req.body.code || '').trim().toUpperCase();
      const hours = Number(req.body.hours || 24);
      if (!code || !Number.isFinite(hours) || hours <= 0)
        return res.status(400).json({ error: 'bad_request' });

      const now = new Date();
      const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);

      // Solo asigna si no está usado
      const updated = await prisma.coupon.updateMany({
        where: { code, used: false },
        data : { expiresAt }
      });

      if (updated.count === 0) {
        const row = await prisma.coupon.findUnique({ where: { code } });
        if (!row) return res.status(404).json({ error: 'not_found' });
        if (row.used) return res.status(409).json({ error: 'already_used' });
        return res.status(409).json({ error: 'invalid_state' });
      }

      return res.json({ ok: true, code, expiresAt });
    } catch (e) {
      console.error('[coupons.assign] error', e);
      res.status(500).json({ error: 'server' });
    }
  });

  // GET /api/coupons/validate?code=XXXX
  router.get('/validate', async (req, res) => {
    try {
      const code = String(req.query.code || '').trim().toUpperCase();
      if (!code) return res.json({ valid: false, reason: 'missing' });

      const row = await prisma.coupon.findUnique({ where: { code } });
      if (!row) return res.json({ valid: false, reason: 'not_found' });

      const now = Date.now();
      const exp = row.expiresAt ? new Date(row.expiresAt).getTime() : null;

      if (exp && exp <= now) return res.json({ valid: false, reason: 'expired' });
      if (row.used)         return res.json({ valid: false, reason: 'used' });

      const fp = isFpCode(code);
      const expiresInSec = exp ? Math.max(0, Math.floor((exp - now) / 1000)) : null;

      return res.json({
        valid: true,
        code,
        kind: fp ? 'FP' : 'PERCENT',
        percent: fp ? 0 : Number(row.percent || 0),
        value: fp ? FP_VALUE_EUR : 0,
        expiresAt: row.expiresAt || null,
        expiresInSec, // ← para countdown
      });
    } catch (e) {
      console.error('[coupons.validate] error', e);
      res.status(500).json({ valid: false, error: 'server' });
    }
  });

  // POST /api/coupons/redeem  { code, saleId? }
  router.post('/redeem', async (req, res) => {
    try {
      const code = String(req.body.code || '').trim().toUpperCase();
      const saleId = req.body.saleId ?? null;
      if (!code) return res.status(400).json({ error: 'code_required' });

      const now = new Date();

      const result = await prisma.coupon.updateMany({
        where: {
          code,
          used: false,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { used: true, usedAt: now, saleId },
      });

      if (result.count === 0) {
        const row = await prisma.coupon.findUnique({ where: { code } });
        if (!row) return res.status(404).json({ error: 'not_found' });
        if (row.used) return res.status(409).json({ error: 'already_used' });
        if (row.expiresAt && row.expiresAt <= now) return res.status(409).json({ error: 'expired' });
        return res.status(409).json({ error: 'invalid_state' });
      }

      const fp = isFpCode(code);
      return res.json({
        ok: true,
        code,
        kind: fp ? 'FP' : 'PERCENT',
        percent: fp ? 0 : undefined,
        value: fp ? FP_VALUE_EUR : undefined,
        usedAt: now,
        saleId: saleId ?? undefined,
      });
    } catch (e) {
      console.error('[coupons.redeem] error', e);
      res.status(500).json({ error: 'server' });
    }
  });

  return router;
};
