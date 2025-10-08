// backend VENTAS: src/routes/coupons.js
'use strict';

const express = require('express');
const router = express.Router();
const sendSMS = require('../utils/sendSMS'); // usa Messaging Service SID

// ====== Helpers ======
const TZ = process.env.TIMEZONE || 'Europe/Madrid';

// Compat temporal con el front actual (muestra “pizza gratis”)
const LEGACY_FP_LABEL = 'FP';
const LEGACY_PERCENT_LABEL = 'PERCENT';

// Prefijos por tipo
const PREFIX = {
  RANDOM_PERCENT: 'MCP-RC',
  FIXED_PERCENT : 'MCP-PF',
  FIXED_AMOUNT  : 'MCP-CD',
};

// Día de semana a número 0..6 (dom=0)
const esDayToNum = (d) => {
  const map = {
    domingo:0, lunes:1, martes:2, miercoles:3, miércoles:3,
    jueves:4, viernes:5, sabado:6, sábado:6
  };
  const k = String(d || '').toLowerCase();
  return (k in map) ? map[k] : null;
};

// Convierte cualquier JSON de daysActive a array de 0..6
function normalizeDaysActive(v) {
  if (!v) return [];
  let a = v;
  if (typeof v === 'string') { try { a = JSON.parse(v); } catch { a = [v]; } }
  if (!Array.isArray(a)) a = [a];
  const out = [];
  for (const x of a) {
    if (typeof x === 'number' && x >= 0 && x <= 6) out.push(x);
    else {
      const n = esDayToNum(x);
      if (n != null) out.push(n);
    }
  }
  return Array.from(new Set(out)).sort();
}

// “Fecha/hora actual” en TZ como Date local (con workaround)
function nowInTZ() {
  // Truco: formatear a string en TZ y volver a Date (pierde TZ pero conserva campos)
  const s = new Date().toLocaleString('sv-SE', { timeZone: TZ }); // “YYYY-MM-DD HH:mm:ss”
  return new Date(s.replace(' ', 'T'));
}

function fmtExpiry(d) {
  try {
    return new Date(d).toLocaleString('es-ES', {
      timeZone: TZ, day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  } catch (_) {
    return new Date(d).toISOString();
  }
}

function minutesOfDay(dateLike) {
  const d = (dateLike instanceof Date) ? dateLike : new Date(dateLike);
  return d.getHours() * 60 + d.getMinutes();
}

function isWithinWindow(row, ref = nowInTZ()) {
  const days = normalizeDaysActive(row.daysActive);
  if (!days.length && row.windowStart == null && row.windowEnd == null) return true;

  const day = ref.getDay(); // 0..6
  if (days.length && !days.includes(day)) return false;

  const start = (row.windowStart == null) ? 0 : Number(row.windowStart);
  const end   = (row.windowEnd   == null) ? 24 * 60 : Number(row.windowEnd);
  const m     = minutesOfDay(ref);

  if (start <= end) return m >= start && m < end;
  // Ventana que cruza medianoche (ej. 22:00–03:00)
  return m >= start || m < end;
}

function isActiveByDate(row, ref = nowInTZ()) {
  const t = ref.getTime();
  if (row.activeFrom && new Date(row.activeFrom).getTime() > t) return false;
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= t) return false;
  return true;
}
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const pick = (n) => Array.from({ length: n }, () =>
  CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
).join('');

function codePattern(prefix) {
  // prefix llega como "MCP-RC" | "MCP-PF" | "MCP-CD"
  const tag = String(prefix || '').replace(/^MCP-/, '').slice(0, 2).toUpperCase();
  return `MCP-${tag}${pick(2)}-${pick(4)}`;
}

// --- API Key SOLO para endpoints internos (issue/assign/bulk-generate)
function requireApiKey(req, res, next) {
  const want = process.env.SALES_API_KEY;
  const got  = req.header('x-api-key');
  if (!want) return res.status(500).json({ error: 'server_misconfigured' });
  if (got !== want) return res.status(401).json({ error: 'unauthorized' });
  next();
}

module.exports = (prisma) => {
  /* ==========================================================
   * ================  CREACIÓN MASIVA (nuevo)  ================
   * ========================================================== */

  router.post('/bulk-generate', requireApiKey, async (req, res) => {
    try {
      const {
        type,
        quantity = 1,
        percent,
        percentMin,
        percentMax,
        amount,
        maxAmount,
        usageLimit = 1,
        assignedToId = null,
        segments = null,
        activeFrom = null,
        expiresAt = null,
        daysActive = null,
        windowStart = null,
        windowEnd = null,
      } = req.body;

      const qty = Math.max(1, Math.min(Number(quantity) || 1, 10000));

      // Validaciones por tipo
      let kind, variant;
      if (type === 'RANDOM_PERCENT') {
        kind = 'PERCENT'; variant = 'RANGE';
        const min = Number(percentMin); const max = Number(percentMax);
        if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min || max > 90) {
          return res.status(400).json({ error: 'bad_range' });
        }
      } else if (type === 'FIXED_PERCENT') {
        kind = 'PERCENT'; variant = 'FIXED';
        const p = Number(percent);
        if (!Number.isFinite(p) || p < 1 || p > 90) {
          return res.status(400).json({ error: 'bad_percent' });
        }
      } else if (type === 'FIXED_AMOUNT') {
        kind = 'AMOUNT'; variant = 'FIXED';
        const a = Number(amount);
        if (!Number.isFinite(a) || a <= 0) {
          return res.status(400).json({ error: 'bad_amount' });
        }
      } else {
        return res.status(400).json({ error: 'bad_type' });
      }

      // Normalizaciones
      const segJson = Array.isArray(segments) && segments.length ? segments : null;
      const daysJson = normalizeDaysActive(daysActive || null);
      const winStart = (windowStart == null || windowStart === '') ? null : Number(windowStart);
      const winEnd   = (windowEnd   == null || windowEnd   === '') ? null : Number(windowEnd);

      // Preparar payloads
      const prefix =
        type === 'RANDOM_PERCENT' ? PREFIX.RANDOM_PERCENT :
        type === 'FIXED_PERCENT'  ? PREFIX.FIXED_PERCENT  :
                                    PREFIX.FIXED_AMOUNT;

      // Generar códigos únicos en memoria
      const codes = new Set();
      while (codes.size < qty) codes.add(codePattern(prefix));
      const codeArr = Array.from(codes);

      // Datos base
      const base = {
        kind, variant,
        percent     : kind === 'PERCENT' && variant === 'FIXED' ? Number(percent) : null,
        percentMin  : kind === 'PERCENT' && variant === 'RANGE' ? Number(percentMin) : null,
        percentMax  : kind === 'PERCENT' && variant === 'RANGE' ? Number(percentMax) : null,
        amount      : kind === 'AMOUNT' ? String(Number(amount)) : null,
        maxAmount   : (kind === 'PERCENT' && maxAmount != null && maxAmount !== '')
                       ? String(Number(maxAmount)) : null,
        assignedToId: assignedToId ? Number(assignedToId) : null,
        segments    : segJson,
        activeFrom  : activeFrom ? new Date(activeFrom) : null,
        expiresAt   : expiresAt  ? new Date(expiresAt)  : null,
        daysActive  : daysJson.length ? daysJson : null,
        windowStart : (winStart != null ? winStart : null),
        windowEnd   : (winEnd   != null ? winEnd   : null),
        usageLimit  : Math.max(1, Number(usageLimit) || 1),
        usedCount   : 0,
        status      : 'ACTIVE',
      };

      // Para RANDOM: fijar percent en generación (uniforme entero)
      function rndPercent(min, max) {
        const lo = Math.ceil(min), hi = Math.floor(max);
        return Math.floor(Math.random() * (hi - lo + 1)) + lo; // incl ambos
      }

      const rows = codeArr.map(code => ({
        code,
        ...base,
        percent : (kind === 'PERCENT' && variant === 'RANGE')
                    ? rndPercent(base.percentMin, base.percentMax)
                    : base.percent
      }));

      // Inserción
      await prisma.coupon.createMany({ data: rows, skipDuplicates: true });

      return res.json({
        ok: true,
        created: rows.length,
        sample: rows.slice(0, Math.min(10, rows.length)).map(r => r.code),
        prefix,
        type,
        constraints: {
          activeFrom: base.activeFrom,
          expiresAt : base.expiresAt,
          daysActive: base.daysActive,
          windowStart: base.windowStart,
          windowEnd  : base.windowEnd,
          usageLimit: base.usageLimit,
          segments: segJson,
          assignedToId: base.assignedToId
        }
      });
    } catch (e) {
      console.error('[coupons.bulk-generate] error', e);
      return res.status(500).json({ error: 'server' });
    }
  });

  /* ===================== ISSUE (compat juego) ===================== */
  router.post('/issue', requireApiKey, async (req, res) => {
    try {
      const prefix = String(req.body.prefix || PREFIX.FIXED_AMOUNT).toUpperCase();
      const hours  = Number(req.body.hours || 24);
      if (!Number.isFinite(hours) || hours <= 0) {
        return res.status(400).json({ error: 'bad_request' });
      }

      const now = nowInTZ();
      const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);

      // buscar cupón disponible por prefijo, activo y sin agotar usos
      const row = await prisma.coupon.findFirst({
        where: {
          code: { startsWith: prefix },
          status: 'ACTIVE',
          usedCount: { lt: prisma.coupon.fields.usageLimit }, // prisma v5: field ref
          OR: [{ expiresAt: null }, { expiresAt: { lt: now } }],
        },
        orderBy: { id: 'asc' }
      });

      if (!row) return res.status(409).json({ error: 'out_of_stock' });

      await prisma.coupon.update({
        where: { code: row.code },
        data : { expiresAt }
      });

      // Notificaciones
      const contact     = String(req.body.contact || '').trim();
      const gameNumber  = req.body.gameNumber ?? null;
      const siteUrl     = process.env.COUPON_SITE_URL || 'https://www.mycrushpizza.com';
      const adminPhone  = process.env.ADMIN_PHONE || '';
      const whenTxt     = fmtExpiry(expiresAt);
      const code        = row.code;
      const notify = { user: { tried: false }, admin: { tried: false } };

      if (contact) {
        notify.user.tried = true;
        const userMsg =
          `Felicidades 🎉 Has obtenido un cupón.\n` +
          `Canjéalo en ${siteUrl} con el código: ${code}\n` +
          `Vence ${whenTxt}.`;
        try {
          const resp = await sendSMS(contact, userMsg);
          notify.user.ok  = true;
          notify.user.sid = resp.sid;
        } catch (err) {
          notify.user.ok = false;
          notify.user.error = err.message;
        }
      }
      if (adminPhone) {
        notify.admin.tried = true;
        const adminMsg =
          `ALERTA MCP 🎯 Cupón emitido\n` +
          `Code: ${code} (vence ${whenTxt})\n` +
          `Tel cliente: ${contact || '-'}\n` +
          `Game#: ${gameNumber ?? '-'}`;
        try {
          const resp = await sendSMS(adminPhone, adminMsg);
          notify.admin.ok  = true;
          notify.admin.sid = resp.sid;
        } catch (err) {
          notify.admin.ok = false;
          notify.admin.error = err.message;
        }
      }

      // Compat: en validate devolvemos “FP” si es amount
      const legacyKind = row.kind === 'AMOUNT' ? LEGACY_FP_LABEL : LEGACY_PERCENT_LABEL;

      return res.json({
        ok: true,
        code,
        // v2
        kindV2: row.kind, amount: row.amount ? Number(row.amount) : null, percent: row.percent || null,
        // compat v1 (front actual)
        kind: legacyKind,
        value: row.amount ? Number(row.amount) : 0,
        expiresAt,
        notify
      });
    } catch (e) {
      console.error('[coupons.issue] error', e);
      return res.status(500).json({ error: 'server' });
    }
  });

  /* ===================== ASSIGN (compat admin) ===================== */
  router.post('/assign', requireApiKey, async (req, res) => {
    try {
      const code  = String(req.body.code || '').trim().toUpperCase();
      const hours = Number(req.body.hours || 24);
      if (!code || !Number.isFinite(hours) || hours <= 0) {
        return res.status(400).json({ error: 'bad_request' });
      }

      const now = nowInTZ();
      const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);

      const updated = await prisma.coupon.updateMany({
        where: { code, status: 'ACTIVE' },
        data : { expiresAt }
      });

      if (updated.count === 0) {
        const row = await prisma.coupon.findUnique({ where: { code } });
        if (!row) return res.status(404).json({ error: 'not_found' });
        if (row.status === 'USED') return res.status(409).json({ error: 'already_used' });
        return res.status(409).json({ error: 'invalid_state' });
      }

      return res.json({ ok: true, code, expiresAt });
    } catch (e) {
      console.error('[coupons.assign] error', e);
      return res.status(500).json({ error: 'server' });
    }
  });

  /* ===================== VALIDATE (público) ===================== */
  // GET /api/coupons/validate?code=XXXX[&customerId=123][&segment=S2]
  // Responde: { valid, kind, percent?, amount?, expiresAt, reason? }
  router.get('/validate', async (req, res) => {
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'bad_request' });

    const customerId = req.query.customerId ? Number(req.query.customerId) : null;
    const segment    = req.query.segment ? String(req.query.segment) : null;
    const refTime    = nowInTZ();

    try {
      const row = await prisma.coupon.findUnique({ where: { code } });
      if (!row) return res.json({ valid: false, reason: 'not_found' });

      // Estado/fechas
      if (row.status === 'DISABLED') return res.json({ valid:false, reason:'disabled' });
      if (row.status === 'USED' && (row.usageLimit ?? 1) <= (row.usedCount ?? 0)) {
        return res.json({ valid:false, reason:'used', expiresAt: row.expiresAt || null });
      }
      if (!isActiveByDate(row, refTime)) {
        return res.json({ valid:false, reason:'expired_or_not_yet', expiresAt: row.expiresAt || null, activeFrom: row.activeFrom || null });
      }
      if (!isWithinWindow(row, refTime)) {
        return res.json({ valid:false, reason:'outside_time_window' });
      }

      // Asignación a cliente (si aplica)
      if (row.assignedToId && customerId && Number(row.assignedToId) !== customerId) {
        return res.json({ valid:false, reason:'not_owner' });
      }

      // Segmentos (si aplica y lo pasaron)
      if (Array.isArray(row.segments) && row.segments.length && segment && !row.segments.includes(segment)) {
        return res.json({ valid:false, reason:'segment_mismatch' });
      }

      // Compat: si es amount, devolvemos kind "FP" (front actual) + amount
      const legacyKind = row.kind === 'AMOUNT' ? LEGACY_FP_LABEL : LEGACY_PERCENT_LABEL;

      return res.json({
        valid: true,
        kind: legacyKind, // compat v1
        // v2
        kindV2: row.kind,
        percent: row.kind === 'PERCENT' ? Number(row.percent || 0) : undefined,
        amount : row.kind === 'AMOUNT' ? Number(row.amount || 0)   : undefined,
        maxAmount: row.maxAmount != null ? Number(row.maxAmount) : undefined,
        expiresAt: row.expiresAt || null
      });
    } catch (e) {
      console.error('[coupons.validate] error', e);
      return res.status(500).json({ error: 'server' });
    }
  });

  /* ===================== REDEEM (público; llamado al confirmar pago) ===================== */
  // POST /api/coupons/redeem { code, orderId?, customerId?, segment? }
  router.post('/redeem', async (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'bad_request' });

    const customerId = req.body.customerId ? Number(req.body.customerId) : null;
    const segment    = req.body.segment ? String(req.body.segment) : null;
    const nowRef     = nowInTZ();

    try {
      // Cargar para validar reglas contextuales
      const row = await prisma.coupon.findUnique({ where: { code } });
      if (!row) return res.status(404).json({ error: 'not_found' });

      if (row.status === 'DISABLED') return res.status(409).json({ error: 'disabled' });
      if (!isActiveByDate(row, nowRef)) return res.status(409).json({ error: 'expired_or_not_yet' });
      if (!isWithinWindow(row, nowRef)) return res.status(409).json({ error: 'outside_time_window' });

      if ((row.usageLimit ?? 1) <= (row.usedCount ?? 0)) {
        return res.status(409).json({ error: 'already_used' });
      }

      if (row.assignedToId && customerId && Number(row.assignedToId) !== customerId) {
        return res.status(409).json({ error: 'not_owner' });
      }
      if (Array.isArray(row.segments) && row.segments.length && segment && !row.segments.includes(segment)) {
        return res.status(409).json({ error: 'segment_mismatch' });
      }

      // 1) Incremento atómico si sigue teniendo usos disponibles
      const inc = await prisma.coupon.updateMany({
        where: {
          code,
          status: 'ACTIVE',
          usedCount: { lt: row.usageLimit || 1 },
          OR: [{ expiresAt: null }, { expiresAt: { gt: nowRef } }],
        },
        data: {
          usedCount: { increment: 1 },
          usedAt: nowRef
        }
      });

      if (inc.count === 0) {
        // Revalidar estado para razón exacta
        const cur = await prisma.coupon.findUnique({ where: { code } });
        if (!cur) return res.status(404).json({ error: 'not_found' });
        if ((cur.usageLimit ?? 1) <= (cur.usedCount ?? 0)) return res.status(409).json({ error: 'already_used' });
        if (cur.status !== 'ACTIVE') return res.status(409).json({ error: 'invalid_state' });
        if (cur.expiresAt && cur.expiresAt <= nowRef) return res.status(409).json({ error: 'expired' });
        return res.status(409).json({ error: 'invalid_state' });
      }

      // 2) Si llegó al límite, marcar USED
      const after = await prisma.coupon.findUnique({ where: { code } });
      if ((after.usedCount ?? 0) >= (after.usageLimit ?? 1) && after.status !== 'USED') {
        await prisma.coupon.update({ where: { code }, data: { status: 'USED' } });
      }

      return res.json({ ok: true, code });
    } catch (e) {
      console.error('[coupons.redeem] error', e);
      return res.status(500).json({ error: 'server' });
    }
  });

  return router;
};
