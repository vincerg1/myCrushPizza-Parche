// back/routes/notify.js
const express = require('express');
const sendSMS = require('../utils/sendSMS'); // usa Messaging Service SID

const ALLOWED_SEGMENTS = ['S1','S2','S3','S4'];

// Helpers
const clamp = (n, lo, hi) => Math.max(lo, Math.min(Number(n) || 0, hi));
const normSegArray = (v) => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',').map(s => s.trim());
  return Array.from(new Set(
    arr.filter(s => ALLOWED_SEGMENTS.includes(s))
  ));
};
const splitPhones = (s='') =>
  String(s).split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
const dedup = (arr) => Array.from(new Set(arr));

module.exports = (prisma) => {
  const router = express.Router();

  // Healthcheck
  router.get('/ping', (_, res) => res.json({ ok: true }));

  // Envío individual simple (compat)
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

  // Preview súper simple (compat)
  router.get('/customers/phones', async (_req, res) => {
    try {
      const rows = await prisma.customer.findMany({
        where: { phone: { not: null }, isRestricted: false },
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

  /**
   * Envío masivo flexible
   * POST /api/notify/bulk-sms
   * Body:
   * {
   *   body: "texto",                        // obligatorio
   *   mode: "all" | "segment" | "single",   // por defecto "all"
   *   segments?: ["S1","S2"],               // si mode="segment"
   *   phones?: "600..., 622..." | [...],    // si mode="single"
   *   testOnly?: boolean,                   // default true
   *   testLimit?: number,                   // default 50 (solo si testOnly)
   *   batchSize?: number,                   // default 100 (compat: limitPerBatch)
   *   limitPerBatch?: number                // alias compat para batchSize
   * }
   */
  router.post('/bulk-sms', async (req, res) => {
    try {
      const {
        body: text,
        mode = 'all',
        segments,
        phones,
        testOnly = true,
        testLimit,
        batchSize,
        limitPerBatch // compat
      } = req.body || {};

      // Validaciones básicas
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ ok: false, error: 'Falta body (texto del SMS)' });
      }

      const BATCH = clamp((batchSize ?? limitPerBatch ?? 100), 10, 500);
      const TEST_LIM = clamp((testLimit ?? 50), 1, 5000);

      // Construir audiencia según modo
      let targets = [];

      if (mode === 'single') {
        const list = Array.isArray(phones) ? phones : splitPhones(String(phones || ''));
        targets = dedup(list).map(p => ({ id: null, phone: p }));
        if (!targets.length) {
          return res.status(400).json({ ok: false, error: 'No hay teléfonos para envío individual' });
        }
      } else if (mode === 'segment') {
        const segs = normSegArray(segments);
        if (!segs.length) {
          return res.status(400).json({ ok: false, error: 'Debes indicar al menos un segmento' });
        }
        targets = await prisma.customer.findMany({
          where: {
            phone: { not: null },
            isRestricted: false,
            segment: { in: segs }
          },
          select: { id: true, phone: true },
          orderBy: { id: 'asc' }
        });
      } else { // 'all' por defecto
        targets = await prisma.customer.findMany({
          where: { phone: { not: null }, isRestricted: false },
          select: { id: true, phone: true },
          orderBy: { id: 'asc' }
        });
      }

      // Normalizar y deduplicar por teléfono (texto plano; sendSMS normaliza a E.164)
      const cleaned = dedup(
        targets
          .map(c => ({ id: c.id ?? null, phone: String(c.phone || '').trim() }))
          .filter(c => !!c.phone)
          .map(c => `${c.phone}::${c.id ?? ''}`)
      ).map(s => {
        const [phone, id] = s.split('::');
        return { id: id ? Number(id) : null, phone };
      });

      const totalCandidates = cleaned.length;

      // Modo prueba: limitar a primeros N
      const targetList = testOnly ? cleaned.slice(0, TEST_LIM) : cleaned;

      let sent = 0, accepted = 0, failed = 0;
      const errors = [];
      const sample = targetList.slice(0, 5).map(t => t.phone);

      for (let i = 0; i < targetList.length; i += BATCH) {
        const slice = targetList.slice(i, i + BATCH);
        /* eslint-disable no-await-in-loop */
        const results = await Promise.allSettled(
          slice.map(item => sendSMS(item.phone, text))
        );
        results.forEach((r, idx) => {
          sent++;
          if (r.status === 'fulfilled') {
            accepted++;
          } else {
            failed++;
            const t = slice[idx];
            const err = r.reason || {};
            console.error('[twilio] bulk send error', {
              id: t.id, phone: t.phone, message: err.message, code: err.code, moreInfo: err.moreInfo
            });
            if (errors.length < 50) {
              errors.push({
                id: t.id, phone: t.phone,
                message: err.message || 'unknown', code: err.code, moreInfo: err.moreInfo
              });
            }
          }
        });
        // Pequeña pausa entre tandas si quieres
        // await new Promise(r => setTimeout(r, 150));
      }

      return res.json({
        ok: true,
        mode,
        segments: normSegArray(segments),
        testOnly: !!testOnly,
        testLimit: TEST_LIM,
        batchSize: BATCH,
        totalCandidates,
        target: targetList.length,
        sent, accepted, failed,
        sample,
        errors
      });
    } catch (err) {
      console.error('[notify] /bulk-sms error:', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
};
