// back/routes/notify.js
const express = require('express');
const sendSMS = require('../utils/sendSMS'); // usa Messaging Service SID

// Exporta una función que recibe prisma desde index.js
module.exports = (prisma) => {
  const router = express.Router();

  // Healthcheck
  router.get('/ping', (_, res) => res.json({ ok: true }));

  // Envío individual
  router.post('/sms', async (req, res) => {
    try {
      const { to, body } = req.body || {};
      if (!to || !body) {
        return res.status(400).json({ ok: false, error: 'Parámetros requeridos: to, body' });
      }
      const msg = await sendSMS(to, body); // toE164 se hace dentro de sendSMS
      return res.json({ ok: true, sid: msg.sid, status: msg.status });
    } catch (err) {
      console.error('[twilio] /sms error:', {
        message: err.message, code: err.code, moreInfo: err.moreInfo
      });
      return res.status(500).json({ ok: false, error: err.message, code: err.code, moreInfo: err.moreInfo });
    }
  });

  // Preview teléfonos (no nulos)
  router.get('/customers/phones', async (_req, res) => {
    try {
      const rows = await prisma.customer.findMany({
        where: { phone: { not: null } },
        select: { phone: true },
        orderBy: { id: 'asc' }
      });
      const phones = rows.map(r => String(r.phone || '').trim()).filter(Boolean);
      res.json({ ok: true, total: phones.length, phones: phones.slice(0, 5) });
    } catch (err) {
      console.error('[notify] /customers/phones error:', err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Envío masivo
  // Body: { body: "texto", testOnly: true, limitPerBatch: 50 }
  router.post('/bulk-sms', async (req, res) => {
    try {
      const { body, testOnly = true, limitPerBatch = 50 } = req.body || {};
      if (!body || typeof body !== 'string' || !body.trim()) {
        return res.status(400).json({ ok: false, error: 'Falta body (texto del SMS)' });
      }

      const customers = await prisma.customer.findMany({
        where: { phone: { not: null } },
        select: { id: true, name: true, phone: true },
        orderBy: { id: 'asc' }
      });

      const all = customers
        .map(c => ({ ...c, phone: String(c.phone || '').trim() }))
        .filter(c => !!c.phone);

      const target = testOnly
        ? all.filter(c => [78, 81].includes(c.id))  
        : all;
      const BATCH = Math.max(10, Math.min(Number(limitPerBatch) || 50, 500));

      let sent = 0, accepted = 0, failed = 0;
      const errors = [];

      for (let i = 0; i < target.length; i += BATCH) {
        const slice = target.slice(i, i + BATCH);
        /* eslint-disable no-await-in-loop */
        const results = await Promise.allSettled(
          slice.map(item => sendSMS(item.phone, body))
        );
        results.forEach((r, idx) => {
          sent++;
          if (r.status === 'fulfilled') accepted++;
          else {
            failed++;
            const t = slice[idx];
            const err = r.reason || {};
            console.error('[twilio] bulk send error', {
              id: t.id, phone: t.phone, message: err.message, code: err.code, moreInfo: err.moreInfo
            });
            errors.push({
              id: t.id, phone: t.phone,
              message: err.message || 'unknown', code: err.code, moreInfo: err.moreInfo
            });
          }
        });
        // opcional: pequeña pausa entre tandas
        // await new Promise(r => setTimeout(r, 200));
      }

      return res.json({ ok: true, total: all.length, target: target.length, sent, accepted, failed, errors });
    } catch (err) {
      console.error('[notify] /bulk-sms error:', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
};
