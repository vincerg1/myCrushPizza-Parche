'use strict';

const express = require('express');
const router = express.Router();

const FP_VALUE_EUR = 9.99;
const isFpCode = (code) => /^MCP-FP/i.test(String(code || ''));

// --- NUEVO: middleware de API key ---
function requireApiKey(req, res, next) {
  const want = process.env.SALES_API_KEY;
  const got  = req.header('x-api-key');
  if (!want) return res.status(500).json({ error: 'server_misconfigured' });
  if (got !== want) return res.status(401).json({ error: 'unauthorized' });
  next();
}

module.exports = (prisma) => {
  // --------- NUEVO: emitir cupón FP ---------
  // POST /api/coupons/issue { hours?: number, prefix?: string }
  // Devuelve un cupón MCP-FP libre y le fija expiresAt = now + hours
  router.post('/issue', requireApiKey, async (req, res) => {
    try {
      const prefix = String(req.body.prefix || 'MCP-FP').toUpperCase();
      const hours  = Number(req.body.hours || 24);
      if (!Number.isFinite(hours) || hours <= 0)
        return res.status(400).json({ error: 'bad_request' });

      const now = new Date();
      const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);

      // Busca un cupón del prefijo, no usado y sin caducidad (o caducado para re-asignar)
      const row = await prisma.coupon.findFirst({
        where: {
          code: { startsWith: prefix },
          used: false,
          OR: [
            { expiresAt: null },
            { expiresAt: { lt: now } }
          ],
        },
        orderBy: { id: 'asc' }, // o createdAt si prefieres
      });

      if (!row) return res.status(409).json({ error: 'out_of_stock' });

      await prisma.coupon.update({
        where: { code: row.code },
        data : { expiresAt },
      });

      return res.json({
        ok: true,
        code: row.code,
        kind: isFpCode(row.code) ? 'FP' : 'PERCENT',
        value: isFpCode(row.code) ? FP_VALUE_EUR : 0,
        expiresAt,
      });
    } catch (e) {
      console.error('[coupons.issue] error', e);
      res.status(500).json({ error: 'server' });
    }
  });

  // --------- PROTEGER /assign con API key (recomendado) ----------
  // Si prefieres dejar /assign abierto, quita "requireApiKey" aquí.
  router.post('/assign', requireApiKey, async (req, res) => {
    try {
      const code  = String(req.body.code || '').trim().toUpperCase();
      const hours = Number(req.body.hours || 24);
      if (!code || !Number.isFinite(hours) || hours <= 0)
        return res.status(400).json({ error: 'bad_request' });

      const now = new Date();
      const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);

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

  // ... tus rutas /validate y /redeem quedan igual ...
  router.get('/validate', async (req, res) => { /* (igual que lo tienes) */ });
  router.post('/redeem', async (req, res) => { /* (igual que lo tienes) */ });

  return router;
};
