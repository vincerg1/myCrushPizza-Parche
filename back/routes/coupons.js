// backend VENTAS: src/routes/coupons.js
'use strict';

const express = require('express');
const router = express.Router();
const sendSMS = require('../utils/sendSMS'); // usa Messaging Service SID

const FP_VALUE_EUR = 9.99;
const isFpCode = (code) => /^MCP-FP/i.test(String(code || ''));

// helper: fecha dd/mm hh:mm en TZ deseada
function fmtExpiry(d) {
  try {
    return new Date(d).toLocaleString('es-ES', {
      timeZone: process.env.TIMEZONE || 'Europe/Madrid',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (_) {
    return new Date(d).toISOString();
  }
}

// --- API Key SOLO para endpoints internos (issue/assign). validate/redeem son públicos desde el checkout.
function requireApiKey(req, res, next) {
  const want = process.env.SALES_API_KEY;
  const got  = req.header('x-api-key');
  if (!want) return res.status(500).json({ error: 'server_misconfigured' });
  if (got !== want) return res.status(401).json({ error: 'unauthorized' });
  next();
}

module.exports = (prisma) => {
  /* ===================== ISSUE (para el juego) ===================== */
  router.post('/issue', requireApiKey, async (req, res) => {
    try {
      const prefix = String(req.body.prefix || 'MCP-FP').toUpperCase();
      const hours  = Number(req.body.hours || 24);
      if (!Number.isFinite(hours) || hours <= 0) {
        return res.status(400).json({ error: 'bad_request' });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);

      const row = await prisma.coupon.findFirst({
        where: {
          code: { startsWith: prefix },
          used: false,
          OR: [{ expiresAt: null }, { expiresAt: { lt: now } }],
        },
        orderBy: { id: 'asc' }
      });

      if (!row) return res.status(409).json({ error: 'out_of_stock' });

      await prisma.coupon.update({
        where: { code: row.code },
        data : { expiresAt },
      });

      // ===== Notificaciones SMS (usuario + admin) =====
      const contact     = String(req.body.contact || '').trim();
      const gameNumber  = req.body.gameNumber ?? null;
      const siteUrl     = process.env.COUPON_SITE_URL || 'https://www.mycrushpizza.com';
      const adminPhone  = process.env.ADMIN_PHONE || '';
      const whenTxt     = fmtExpiry(expiresAt);
      const code        = row.code;

      const notify = { user: { tried: false }, admin: { tried: false } };

      // Usuario
      if (contact) {
        notify.user.tried = true;
        const userMsg =
          `Felicidades 🎉 Has ganado una pizza gratis.\n` +
          `Canjéala en ${siteUrl} con el cupón FP: ${code}\n` +
          `Vence ${whenTxt}.`;
        try {
          console.log('[sms][user] intentando enviar a', contact);
          const resp = await sendSMS(contact, userMsg);
          notify.user.ok  = true;
          notify.user.sid = resp.sid;
          console.log('[sms][user] enviado ok sid=', resp.sid);
        } catch (err) {
          notify.user.ok = false;
          notify.user.error = err.message;
          console.error('[sms][user] error:', err.message);
        }
      } else {
        console.log('[sms][user] omitido: no hay contact en payload');
      }

      // Admin
      if (adminPhone) {
        notify.admin.tried = true;
        const adminMsg =
          `ALERTA MCP 🎯 Cupón FP emitido\n` +
          `Code: ${code} (vence ${whenTxt})\n` +
          `Tel cliente: ${contact || '-'}\n` +
          `Game#: ${gameNumber ?? '-'}`;
        try {
          console.log('[sms][admin] intentando enviar a', adminPhone);
          const resp = await sendSMS(adminPhone, adminMsg);
          notify.admin.ok  = true;
          notify.admin.sid = resp.sid;
          console.log('[sms][admin] enviado ok sid=', resp.sid);
        } catch (err) {
          notify.admin.ok = false;
          notify.admin.error = err.message;
          console.error('[sms][admin] error:', err.message);
        }
      } else {
        console.log('[sms][admin] omitido: falta ADMIN_PHONE');
      }
      // ===== /Notificaciones =====

      return res.json({
        ok: true,
        code,
        kind: isFpCode(code) ? 'FP' : 'PERCENT',
        value: isFpCode(code) ? FP_VALUE_EUR : 0,
        expiresAt,
        notify
      });
    } catch (e) {
      console.error('[coupons.issue] error', e);
      return res.status(500).json({ error: 'server' });
    }
  });

  /* ===================== ASSIGN (opcional admin) ===================== */
  router.post('/assign', requireApiKey, async (req, res) => {
    try {
      const code  = String(req.body.code || '').trim().toUpperCase();
      const hours = Number(req.body.hours || 24);
      if (!code || !Number.isFinite(hours) || hours <= 0) {
        return res.status(400).json({ error: 'bad_request' });
      }

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
      return res.status(500).json({ error: 'server' });
    }
  });

  /* ===================== VALIDATE (público) ===================== */
  // GET /api/coupons/validate?code=XXXX
  // Responde SIEMPRE rápido (nada de colgarse): { valid, kind, percent?, expiresAt, reason? }
  router.get('/validate', async (req, res) => {
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'bad_request' });

    const now = new Date();
    try {
      const row = await prisma.coupon.findUnique({ where: { code } });
      if (!row) return res.json({ valid: false, reason: 'not_found' });

      if (row.used) {
        return res.json({ valid: false, reason: 'used', expiresAt: row.expiresAt || null });
      }
      if (row.expiresAt && row.expiresAt <= now) {
        return res.json({ valid: false, reason: 'expired', expiresAt: row.expiresAt });
      }

      const kind = isFpCode(code) ? 'FP' : 'PERCENT';
      const payload = { valid: true, kind, expiresAt: row.expiresAt || null };
      if (kind === 'PERCENT') payload.percent = Number(row.percent || 0);
      return res.json(payload);
    } catch (e) {
      console.error('[coupons.validate] error', e);
      return res.status(500).json({ error: 'server' });
    }
  });

  /* ===================== REDEEM (público; lo llama el backend al confirmar pago) ===================== */
  // POST /api/coupons/redeem { code, orderId? }
  router.post('/redeem', async (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'bad_request' });

    const now = new Date();
    try {
      // operación atómica: marcar usado solo si está válido aún
      const updated = await prisma.coupon.updateMany({
        where: {
          code,
          used: false,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { used: true, usedAt: now }
      });

      if (updated.count === 0) {
        // obtener motivo
        const row = await prisma.coupon.findUnique({ where: { code } });
        if (!row) return res.status(404).json({ error: 'not_found' });
        if (row.used) return res.status(409).json({ error: 'already_used' });
        if (row.expiresAt && row.expiresAt <= now) return res.status(409).json({ error: 'expired' });
        return res.status(409).json({ error: 'invalid_state' });
      }

      return res.json({ ok: true, code });
    } catch (e) {
      console.error('[coupons.redeem] error', e);
      return res.status(500).json({ error: 'server' });
    }
  });

  return router;
};
