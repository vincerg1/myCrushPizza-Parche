// backend VENTAS: src/routes/coupons.js
'use strict';

const express = require('express');
const router = express.Router();
const sendSMS = require('../utils/sendSMS'); // usa Messaging Service SID

// ====== Helpers ======
const TZ = process.env.TIMEZONE || 'Europe/Madrid';
const LEGACY_FP_LABEL = 'FP';
const LEGACY_PERCENT_LABEL = 'PERCENT';
const PREFIX = {
  RANDOM_PERCENT: 'MCP-RC',
  FIXED_PERCENT : 'MCP-PF',
  FIXED_AMOUNT  : 'MCP-CD',
};
// Construye filtro de Prisma a partir de type + key (igual que la galería)
function buildWhereForTypeKey(type, key) {
  const t = String(type || '').toUpperCase();
  const k = String(key || '').trim();

  if (!t || !k) return null;

  if (t === 'FIXED_PERCENT') {
    const p = Number(k.replace('%', '').trim());
    if (!Number.isFinite(p)) return null;
    return {
      kind: 'PERCENT',
      variant: 'FIXED',
      percent: p
    };
  }

  if (t === 'RANDOM_PERCENT') {
    // soporta "5-10" y "5–10"
    const m = k.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (!m) return null;
    const pMin = Number(m[1]);
    const pMax = Number(m[2]);
    if (!Number.isFinite(pMin) || !Number.isFinite(pMax) || pMin >= pMax) return null;
    return {
      kind: 'PERCENT',
      variant: 'RANGE',
      percentMin: pMin,
      percentMax: pMax
    };
  }

  if (t === 'FIXED_AMOUNT') {
    const a = Number(k.replace('€', '').trim().replace(',', '.'));
    if (!Number.isFinite(a) || a <= 0) return null;
    return {
      kind: 'AMOUNT',
      variant: 'FIXED',
      amount: String(a) // en schema amount es Decimal almacenado como string
    };
  }

  return null;
}

// Título legible para el cupón (similar a titleFor de /gallery)
function titleForCouponRow(r) {
  const kind = r.kind;
  const variant = r.variant || 'FIXED';
  const pct = toNum(r.percent);
  const pMin = toNum(r.percentMin);
  const pMax = toNum(r.percentMax);
  const amt = toNum(r.amount);

  if (kind === 'PERCENT' && variant === 'RANGE' && pMin != null && pMax != null) {
    return `${pMin}–${pMax}%`;
  }
  if (kind === 'PERCENT' && variant === 'FIXED' && pct != null) {
    return `${pct}%`;
  }
  if (kind === 'AMOUNT' && variant === 'FIXED' && amt != null) {
    return `${amt.toFixed(2)} €`;
  }
  return 'Cupón';
}

const esDayToNum = (d) => {
  const map = {
    domingo:0, lunes:1, martes:2, miercoles:3, miércoles:3,
    jueves:4, viernes:5, sabado:6, sábado:6
  };
  const k = String(d || '').toLowerCase();
  return (k in map) ? map[k] : null;
};
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
function requireApiKey(req, res, next) {
  const want = process.env.SALES_API_KEY;
  const got  = req.header('x-api-key');
  if (!want) return res.status(500).json({ error: 'server_misconfigured' });
  if (got !== want) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// conversión robusta a number (Decimal/string/number)
const toNum = (v) => {
  if (v == null) return null;
  if (typeof v === 'object' && typeof v.toNumber === 'function') {
    try { return v.toNumber(); } catch { /* noop */ }
  }
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
};

module.exports = (prisma) => {

/* ===========================
 *  BULK GENERATE
 * =========================== */
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

      // NUEVO: etiquetado para juegos / campañas
      acquisition = null,  // 'GAME' | 'CLAIM' | 'REWARD' | 'BULK' | 'OTHER'
      channel     = null,  // 'GAME' | 'WEB' | 'CRM' | 'STORE' | 'APP'
      gameId      = null,  // Number (si es premio de un juego)
      campaign    = null,
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

    // Prefijo
    const prefix =
      type === 'RANDOM_PERCENT' ? PREFIX.RANDOM_PERCENT :
      type === 'FIXED_PERCENT'  ? PREFIX.FIXED_PERCENT  :
                                  PREFIX.FIXED_AMOUNT;

    // Códigos únicos
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

      // NUEVO: etiquetas
      acquisition : acquisition ? String(acquisition).toUpperCase() : null,
      channel     : channel     ? String(channel).toUpperCase()     : null,
      gameId      : gameId != null ? Number(gameId) : null,
      campaign    : campaign ?? null
    };

    // RANDOM: fijar percent en generación (uniforme entero)
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

/* ===========================
 *  ISSUE (AMOUNT por prefijo)
 * =========================== */
router.post('/issue', requireApiKey, async (req, res) => {
  try {
    // Por compat seguimos aceptando "prefix", pero forzamos AMOUNT/FIXED
    const prefix = String(req.body.prefix || PREFIX.FIXED_AMOUNT).toUpperCase();
    const hours  = Number(req.body.hours || 24);
    if (!Number.isFinite(hours) || hours <= 0) {
      return res.status(400).json({ error: 'bad_request' });
    }

    const now = nowInTZ();
    const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);

    // cupón disponible: ACTIVO, AMOUNT/FIXED, stock (ilimitado o con saldo), sin expirar
    const row = await prisma.coupon.findFirst({
      where: {
        code:    { startsWith: prefix },
        status:  'ACTIVE',
        kind:    'AMOUNT',
        variant: 'FIXED',
        AND: [
          { OR: [{ usageLimit: null }, { usedCount: { lt: prisma.coupon.fields.usageLimit } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      orderBy: { id: 'asc' }
    });

    if (!row) return res.status(409).json({ error: 'out_of_stock' });

    await prisma.coupon.update({
      where: { code: row.code },
      data : { expiresAt }
    });

    // Notificaciones (opcionales)
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

    const legacyKind = row.kind === 'AMOUNT' ? LEGACY_FP_LABEL : LEGACY_PERCENT_LABEL;

    return res.json({
      ok: true,
      code,
      kindV2: row.kind,
      amount: row.amount ? Number(row.amount) : null,
      percent: null,
      expiresAt,
      kind: legacyKind,
      value: row.amount ? Number(row.amount) : 0,
      notify
    });
  } catch (e) {
    console.error('[coupons.issue] error', e);
    return res.status(500).json({ error: 'server' });
  }
});

/* ===========================
 *  ASSIGN (forzar expiración)
 * =========================== */
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

/* ===========================
 *  VALIDATE
 * =========================== */
router.get('/validate', async (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'bad_request' });

  const customerId = req.query.customerId ? Number(req.query.customerId) : null;
  const segment    = req.query.segment ? String(req.query.segment) : null;
  const refTime    = nowInTZ();

  try {
    const row = await prisma.coupon.findUnique({ where: { code } });
    if (!row) return res.json({ valid: false, reason: 'not_found' });

    if (row.status === 'DISABLED')
      return res.json({ valid:false, reason:'disabled' });

    if ((row.usageLimit ?? 1) <= (row.usedCount ?? 0) && row.status === 'USED')
      return res.json({ valid:false, reason:'used', expiresAt: row.expiresAt || null });

    if (!isActiveByDate(row, refTime))
      return res.json({
        valid:false,
        reason:'expired_or_not_yet',
        expiresAt: row.expiresAt || null,
        activeFrom: row.activeFrom || null
      });

    if (!isWithinWindow(row, refTime))
      return res.json({ valid:false, reason:'outside_time_window' });

    if (row.assignedToId && customerId && Number(row.assignedToId) !== customerId)
      return res.json({ valid:false, reason:'not_owner' });

    if (Array.isArray(row.segments) && row.segments.length && segment && !row.segments.includes(segment))
      return res.json({ valid:false, reason:'segment_mismatch' });

    const type =
      row.kind === 'PERCENT' && row.variant === 'RANGE' ? 'RANDOM_PERCENT' :
      row.kind === 'PERCENT' && row.variant === 'FIXED' ? 'FIXED_PERCENT'  :
      row.kind === 'AMOUNT'  && row.variant === 'FIXED' ? 'FIXED_AMOUNT'   :
      'UNKNOWN';

    return res.json({
      valid: true,
      kind     : row.kind,
      variant  : row.variant,
      type,
      percent  : row.kind === 'PERCENT' ? Number(row.percent || 0) : undefined,
      amount   : row.kind === 'AMOUNT'  ? Number(row.amount  || 0) : undefined,
      maxAmount: row.maxAmount != null ? Number(row.maxAmount)      : undefined,
      expiresAt: row.expiresAt || null
    });
  } catch (e) {
    console.error('[coupons.validate] error', e);
    return res.status(500).json({ error: 'server' });
  }
});

/* ===========================
 *  REDEEM
 * =========================== */
router.post('/redeem', async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'bad_request' });

  const customerId      = req.body.customerId ? Number(req.body.customerId) : null;
  const segmentFromBody = req.body.segmentAtRedeem ? String(req.body.segmentAtRedeem) : null;
  const saleId          = req.body.saleId ? Number(req.body.saleId) : null;
  const storeId         = req.body.storeId ? Number(req.body.storeId) : null;
  const discountValueIn = req.body.discountValue != null ? Number(req.body.discountValue) : null;

  const nowRef = nowInTZ();

  try {
    const row = await prisma.coupon.findUnique({ where: { code } });
    if (!row) return res.status(404).json({ error: 'not_found' });

    if (row.status === 'DISABLED') return res.status(409).json({ error: 'disabled' });
    if (!isActiveByDate(row, nowRef)) return res.status(409).json({ error: 'expired_or_not_yet' });
    if (!isWithinWindow(row, nowRef)) return res.status(409).json({ error: 'outside_time_window' });

    if (row.usageLimit != null && (row.usageLimit <= (row.usedCount ?? 0))) {
      return res.status(409).json({ error: 'already_used' });
    }

    if (row.assignedToId && customerId && Number(row.assignedToId) !== customerId) {
      return res.status(409).json({ error: 'not_owner' });
    }
    if (Array.isArray(row.segments) && row.segments.length && segmentFromBody && !row.segments.includes(segmentFromBody)) {
      return res.status(409).json({ error: 'segment_mismatch' });
    }

    const whereUpdate = {
      code,
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: nowRef } }],
      ...(row.usageLimit == null ? {} : { usedCount: { lt: row.usageLimit } }),
    };

    const inc = await prisma.coupon.updateMany({
      where: whereUpdate,
      data: {
        usedCount: { increment: 1 },
        usedAt: nowRef
      }
    });

    if (inc.count === 0) {
      const cur = await prisma.coupon.findUnique({ where: { code } });
      if (!cur) return res.status(404).json({ error: 'not_found' });
      if (cur.usageLimit != null && (cur.usageLimit <= (cur.usedCount ?? 0))) return res.status(409).json({ error: 'already_used' });
      if (cur.status !== 'ACTIVE') return res.status(409).json({ error: 'invalid_state' });
      if (cur.expiresAt && cur.expiresAt <= nowRef) return res.status(409).json({ error: 'expired' });
      return res.status(409).json({ error: 'invalid_state' });
    }

    const after = await prisma.coupon.findUnique({ where: { code } });
    if (after.usageLimit != null && (after.usedCount ?? 0) >= after.usageLimit && after.status !== 'USED') {
      await prisma.coupon.update({ where: { code }, data: { status: 'USED' } });
    }

    (async () => {
      try {
        let segmentAtRedeem = segmentFromBody || null;
        if (!segmentAtRedeem && customerId) {
          const c = await prisma.customer.findUnique({
            where: { id: Number(customerId) },
            select: { segment: true }
          });
          if (c?.segment) segmentAtRedeem = c.segment; // S1..S4
        }

        const kind    = after.kind;
        const variant = after.variant;
        let percentApplied = null;
        let amountApplied  = null;

        if (kind === 'PERCENT') {
          percentApplied = Number(after.percent ?? 0) || null;
        } else if (kind === 'AMOUNT') {
          amountApplied = after.amount ? Number(after.amount) : null;
        }

        const discountValue = (discountValueIn != null && !Number.isNaN(discountValueIn))
          ? discountValueIn
          : null;

        await prisma.couponRedemption.create({
          data: {
            couponId: after.id,
            couponCode: code,
            saleId: saleId || null,
            storeId: storeId || null,
            customerId: customerId || null,

            // snapshot
            segmentAtRedeem,
            kind,
            variant,
            percentApplied,
            amountApplied,

            discountValue: discountValue != null ? discountValue : null,
            redeemedAt: nowRef,
            createdAt: nowRef
          }
        });
      } catch (logErr) {
        console.error('[coupons.redeem] log redemption error', logErr);
      }
    })();

    return res.json({ ok: true, code });
  } catch (e) {
    console.error('[coupons.redeem] error', e);
    return res.status(500).json({ error: 'server' });
  }
});

/* ===========================
 *  METRICS (con KPIs nuevos)
 * =========================== */
router.get('/metrics', async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30*864e5);
    const to   = req.query.to   ? new Date(req.query.to)   : new Date();
    const storeId = req.query.storeId ? Number(req.query.storeId) : null;
    const segment = req.query.segment ? String(req.query.segment) : null;

    // ---- helpers ----
    const isoDay = (d) => new Date(d).toISOString().slice(0,10);
    const safeParse = (v) => {
      if (!v) return null;
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { return null; }
      }
      return v;
    };
    const isCouponLine = (line) => {
      const code = String(line?.code || '').toUpperCase();
      const lbl  = String(line?.label || '');
      return code === 'COUPON' || /cup[oó]n/i.test(lbl);
    };
    const extractCouponCode = (line) => {
      if (line?.coupon || line?.codeValue) return String(line.coupon || line.codeValue);
      const m = String(line?.label || '').match(/cup[oó]n\s+([A-Z0-9\-]+)/i);
      return m ? m[1].toUpperCase() : 'UNKNOWN';
    };
    const inferKind = (line, totalProducts) => {
      const lbl = String(line?.label || '');
      if (/%/.test(lbl)) return 'PERCENT';
      const amt = Math.abs(Number(line?.amount || 0));
      if (totalProducts > 0) {
        const rate = amt / totalProducts;
        return rate > 0 && rate <= 1 ? 'PERCENT' : 'AMOUNT';
      }
      return 'AMOUNT';
    };

    // ---- 1) Ventas del rango ----
    const whereSales = {
      date: { gte: from, lte: to },
      status: 'PAID',
      ...(storeId ? { storeId } : {}),
      ...(segment ? { customer: { segment } } : {})  // filtrar por segmento si se pasa en query
    };

    const sales = await prisma.sale.findMany({
      where: whereSales,
      select: {
        id: true, date: true, total: true, totalProducts: true, discounts: true,
        extras: true, channel: true, storeId: true,
        customer: { select: { segment: true } }
      },
      orderBy: { date: 'asc' }
    });

    // ---- 2) Agregación en memoria ----
    let ordersTotal = 0;
    let ordersWithCoupon = 0;
    let gross = 0;
    let net = 0;
    let couponDiscountSum = 0;

    // Para AOV
    let sumTotalWithCoupon = 0;
    let sumTotalWithoutCoupon = 0;

    // Por segmento proporcional
    const segMap = new Map();
    const segKey = (s) => (s == null || s === '') ? 'UNSPEC' : String(s);

    const byKindCount = { PERCENT: 0, AMOUNT: 0 };
    const topCodeMap = new Map();
    const byDayCount = new Map();

    for (const s of sales) {
      ordersTotal += 1;
      gross += Number(s.totalProducts || 0);
      net   += Number(s.total || 0);

      const extras = safeParse(s.extras) || [];
      const couponLines = extras.filter(isCouponLine);
      const hasCoupon = couponLines.length > 0;

      // segmentos
      const sk = segKey(s.customer?.segment);
      const cur = segMap.get(sk) || { segment: sk, orders: 0, withCoupon: 0 };
      cur.orders += 1;
      if (hasCoupon) cur.withCoupon += 1;
      segMap.set(sk, cur);

      if (hasCoupon) {
        ordersWithCoupon += 1;
        sumTotalWithCoupon += Number(s.total || 0);

        const totalProducts = Number(s.totalProducts || 0);
        for (const line of couponLines) {
          const amt = Math.abs(Number(line?.amount || 0));
          couponDiscountSum += amt;

          const k = inferKind(line, totalProducts);
          if (k === 'PERCENT') byKindCount.PERCENT += 1;
          else byKindCount.AMOUNT += 1;

          const code = extractCouponCode(line);
          const c = topCodeMap.get(code) || { count: 0 };
          c.count += 1;
          topCodeMap.set(code, c);
        }

        const dayKey = isoDay(s.date);
        byDayCount.set(dayKey, (byDayCount.get(dayKey) || 0) + 1);
      } else {
        sumTotalWithoutCoupon += Number(s.total || 0);
      }
    }

    const ordersWithoutCoupon = Math.max(0, ordersTotal - ordersWithCoupon);

    // Serie continua
    const days = [];
    for (let t = new Date(from); t <= to; t = new Date(t.getTime() + 864e5)) {
      const key = t.toISOString().slice(0,10);
      days.push({ day: key, value: byDayCount.get(key) || 0 });
    }

    const byCodeTop = Array
      .from(topCodeMap.entries())
      .map(([code, v]) => ({ code, count: v.count }))
      .sort((a,b) => b.count - a.count)
      .slice(0,5);

    const byKind = [
      ...(byKindCount.PERCENT ? [{ kind: 'PERCENT', count: byKindCount.PERCENT }] : []),
      ...(byKindCount.AMOUNT  ? [{ kind: 'AMOUNT',  count: byKindCount.AMOUNT  }] : [])
    ];

    // ---- 3) Periodo previo para comparativas ----
    const periodMs = Math.max(1, to.getTime() - from.getTime());
    const prevFrom = new Date(from.getTime() - periodMs);
    const prevTo   = new Date(from.getTime());

    const prevSales = await prisma.sale.findMany({
      where: {
        status: 'PAID',
        date: { gte: prevFrom, lte: prevTo },
        ...(storeId ? { storeId } : {}),
        ...(segment ? { customer: { segment } } : {})
      },
      select: { id: true, total: true, totalProducts: true, extras: true },
      orderBy: { date: 'asc' }
    });

    let prevOrdersTotal = 0;
    let prevOrdersWithCoupon = 0;
    for (const s of prevSales) {
      prevOrdersTotal += 1;
      const extras = safeParse(s.extras) || [];
      const couponLines = extras.filter(isCouponLine);
      if (couponLines.length > 0) prevOrdersWithCoupon += 1;
    }

    // ---- 4) Emitidos ----
    const issued = await prisma.coupon.count({ where: { createdAt: { gte: from, lte: to } } });

    // ---- 5) KPIs ----
    const aovWith  = ordersWithCoupon    ? (sumTotalWithCoupon    / ordersWithCoupon)    : null;
    const aovWithout = ordersWithoutCoupon ? (sumTotalWithoutCoupon / ordersWithoutCoupon) : null;
    const aovDelta   = (aovWith != null && aovWithout != null) ? (aovWith - aovWithout) : null;
    const aovDeltaPct = (aovWith != null && aovWithout) ? (aovWith / aovWithout - 1) : null;

    const penetrationNow  = ordersTotal ? (ordersWithCoupon / ordersTotal) : null;
    const penetrationPrev = prevOrdersTotal ? (prevOrdersWithCoupon / prevOrdersTotal) : null;
    const penetrationDelta = (penetrationNow != null && penetrationPrev != null)
      ? (penetrationNow - penetrationPrev)
      : null;

    const ordersGrowthPct = (prevOrdersTotal > 0)
      ? ((ordersTotal - prevOrdersTotal) / prevOrdersTotal)
      : null;

    const bySegment = Array.from(segMap.values())
      .map(row => ({
        segment: row.segment,
        orders: row.orders,
        withCoupon: row.withCoupon,
        penetration: row.orders ? (row.withCoupon / row.orders) : null
      }))
      .sort((a, b) => (b.penetration || 0) - (a.penetration || 0) || (b.orders - a.orders));

    const kpi = {
      issued,
      redeemed: ordersWithCoupon,
      redemptionRate: issued > 0 ? ordersWithCoupon / issued : null,
      discountTotal: Number(couponDiscountSum || 0),
      byKind,
      byCodeTop,
      dailySpark: days,

      ordersTotal,
      ordersWithCoupon,
      ordersWithoutCoupon,
      aov: {
        withCoupon: aovWith,
        withoutCoupon: aovWithout,
        delta: aovDelta,
        deltaPct: aovDeltaPct
      },
      prev: {
        ordersTotal: prevOrdersTotal,
        ordersWithCoupon: prevOrdersWithCoupon
      },
      penetration: {
        now: penetrationNow,
        prev: penetrationPrev,
        delta: penetrationDelta
      },
      ordersGrowthPct,
      bySegment
    };

    return res.json({ ok: true, range: { from, to }, storeId, segment, kpi });
  } catch (e) {
    console.error('[coupons.metrics] error', e);
    return res.status(500).json({ ok: false, error: 'server' });
  }
});

/* ===========================
 *  REDEMPTIONS (lista)
 * =========================== */
router.get('/redemptions', async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30*864e5);
    const to   = req.query.to   ? new Date(req.query.to)   : new Date();
    const storeId  = req.query.storeId  ? Number(req.query.storeId)  : null;
    const segment  = req.query.segment  ? String(req.query.segment)  : null;
    const take = Math.max(1, Math.min(Number(req.query.take)||50, 200));
    const skip = Math.max(0, Number(req.query.skip)||0);

    const where = {
      redeemedAt: { gte: from, lte: to },
      ...(storeId ? { storeId } : {}),
      ...(segment ? { segmentAtRedeem: segment } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.couponRedemption.findMany({
        where,
        orderBy: { redeemedAt: 'desc' },
        take, skip,
        include: {
          coupon:   { select: { code: true, kind: true, variant: true } },
          sale:     { select: { id: true, code: true, total: true, date: true } },
          store:    { select: { id: true, storeName: true } },
          customer: { select: { id: true, code: true, name: true, phone: true, segment: true } },
        }
      }),
      prisma.couponRedemption.count({ where })
    ]);

    res.json({ ok: true, total, items });
  } catch (e) {
    console.error('[coupons.redemptions] error', e);
    res.status(500).json({ ok: false, error: 'server' });
  }
});

/* ===========================
 *  GALLERY (cards agrupadas)
 * =========================== */

router.post('/direct-claim', async (req, res) => {
  try {
    const {
      phone,
      name,
      type,
      key,
      hours = 24,
      campaign = null
    } = req.body || {};

    const phoneRaw = String(phone || '').trim();
    if (!phoneRaw) {
      return res.status(400).json({ ok: false, error: 'missing_phone' });
    }
    if (!type || !key) {
      return res.status(400).json({ ok: false, error: 'missing_type_or_key' });
    }
    const H = Number(hours);
    if (!Number.isFinite(H) || H <= 0 || H > 24 * 30) {
      return res.status(400).json({ ok: false, error: 'bad_hours' });
    }

    const whereTypeKey = buildWhereForTypeKey(type, key);
    if (!whereTypeKey) {
      return res.status(400).json({ ok: false, error: 'bad_type_or_key' });
    }

    const now = nowInTZ();
    const expiresAt = new Date(now.getTime() + H * 3600 * 1000);

    // 1) Buscar o crear cliente por teléfono
    let customer = await prisma.customer.findUnique({
      where: { phone: phoneRaw }
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          code: `C${Date.now()}`, // identificador sencillo; ya tienes unique en código
          name: name ? String(name).trim() : null,
          phone: phoneRaw,
          address_1: '-',           // requerido en schema
          origin: 'QR'              // o 'WEB', como prefieras
        }
      });
    } else if (name && !customer.name) {
      // Si tenemos nombre nuevo y el customer no tenía, lo rellenamos
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: { name: String(name).trim() }
      });
    }

    // 2) Comprobar si ya tiene un cupón activo asignado
    const activeCoupon = await prisma.coupon.findFirst({
      where: {
        assignedToId: customer.id,
        status: 'ACTIVE',
        AND: [
          {
            OR: [
              { usageLimit: null },
              { usedCount: { lt: prisma.coupon.fields.usageLimit } }
            ]
          },
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } }
            ]
          }
        ]
      },
      orderBy: { id: 'asc' }
    });

    if (activeCoupon) {
      return res.status(409).json({
        ok: false,
        error: 'already_has_active',
        code: activeCoupon.code,
        expiresAt: activeCoupon.expiresAt
      });
    }

    // 3) Buscar un cupón disponible en el pool (según type+key)
    const poolCoupon = await prisma.coupon.findFirst({
      where: {
        status: 'ACTIVE',
        ...whereTypeKey,
        AND: [
          {
            OR: [
              { usageLimit: null },
              { usedCount: { lt: prisma.coupon.fields.usageLimit } }
            ]
          },
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } }
            ]
          }
        ]
      },
      orderBy: { id: 'asc' }
    });

    if (!poolCoupon) {
      return res.status(409).json({ ok: false, error: 'out_of_stock' });
    }

    // 4) Asignar cupón al cliente, marcar expiración y etiquetar como CLAIM/WEB
    await prisma.coupon.update({
      where: { id: poolCoupon.id },
      data: {
        expiresAt,
        assignedToId: customer.id,
        acquisition: 'CLAIM',
        channel: 'WEB',
        campaign: campaign ?? poolCoupon.campaign ?? null
      }
    });

    const finalCoupon = await prisma.coupon.findUnique({
      where: { id: poolCoupon.id }
    });

    const code = finalCoupon.code;
    const title = titleForCouponRow(finalCoupon);
    const whenTxt = fmtExpiry(expiresAt);
    const siteUrl = process.env.COUPON_SITE_URL || 'https://www.mycrushpizza.com';
    const adminPhone = process.env.ADMIN_PHONE || '';

    // 5) Enviar SMS al cliente (y opcional al admin), igual que en /issue
    const notify = { user: { tried: false }, admin: { tried: false } };

    // SMS al cliente
    if (phoneRaw) {
      notify.user.tried = true;
      const userMsg =
        `🎁 Tu cupón para MyCrushPizza: ${code}\n` +
        `Valor: ${title}\n` +
        `Canjéalo en ${siteUrl} (cupón válido hasta ${whenTxt}).`;
      try {
        const resp = await sendSMS(phoneRaw, userMsg);
        notify.user.ok = true;
        notify.user.sid = resp.sid;
      } catch (err) {
        console.error('[coupons.direct-claim] user SMS error:', err);
        notify.user.ok = false;
        notify.user.error = err.message;
      }
    }

    // SMS al admin (opcional)
    if (adminPhone) {
      notify.admin.tried = true;
      const adminMsg =
        `ALERTA MCP 🎯 Cupón directo emitido\n` +
        `Code: ${code} (${title})\n` +
        `Tel cliente: ${phoneRaw}\n` +
        `Vence: ${whenTxt}.`;
      try {
        const resp = await sendSMS(adminPhone, adminMsg);
        notify.admin.ok = true;
        notify.admin.sid = resp.sid;
      } catch (err) {
        console.error('[coupons.direct-claim] admin SMS error:', err);
        notify.admin.ok = false;
        notify.admin.error = err.message;
      }
    }

    return res.json({
      ok: true,
      code,
      type: type,
      key,
      title,
      expiresAt,
      customerId: customer.id,
      notify
    });
  } catch (e) {
    console.error('[coupons.direct-claim] error', e);
    return res.status(500).json({ ok: false, error: 'server' });
  }
});

router.get('/gallery', async (_req, res) => {
  try {
    const now = nowInTZ();

    const variantOf = (r) => {
      if (r.variant) return r.variant; // 'FIXED' | 'RANGE'
      if (r.kind === 'PERCENT' && toNum(r.percentMin) != null && toNum(r.percentMax) != null) return 'RANGE';
      return 'FIXED';
    };

    const rows = await prisma.coupon.findMany({
      where: { status: 'ACTIVE' },
      select: {
        code: true, kind: true, variant: true,
        percent: true, percentMin: true, percentMax: true,
        amount: true, maxAmount: true,
        daysActive: true, windowStart: true, windowEnd: true,
        activeFrom: true, expiresAt: true,
        usageLimit: true, usedCount: true,
      },
      orderBy: { id: 'asc' }
    });

    const dbg = {
      total: rows.length,
      byKind: { PERCENT: 0, AMOUNT: 0 },
      amount: {
        total: 0, active: 0,
        samplesRejected: [],
        sampleAccepted: null
      }
    };
    for (const r of rows) {
      if (r.kind === 'PERCENT') dbg.byKind.PERCENT++;
      if (r.kind === 'AMOUNT')  dbg.byKind.AMOUNT++;
    }

    const active = rows.filter(r => {
      const inLife   = isActiveByDate(r, now);
      const inWindow = isWithinWindow(r, now);
      const used     = toNum(r.usedCount) ?? 0;
      const limitNum = (r.usageLimit == null) ? null : toNum(r.usageLimit);
      const hasStock = (limitNum == null) ? true : (limitNum > used);

      if (r.kind === 'AMOUNT') {
        dbg.amount.total++;
        if (!(inLife && inWindow && hasStock)) {
          if (dbg.amount.samplesRejected.length < 5) {
            dbg.amount.samplesRejected.push({
              code: r.code,
              reason: !inLife ? 'life' : !inWindow ? 'window' : !hasStock ? 'stock' : 'other',
              usageLimit: limitNum, usedCount: used,
              activeFrom: r.activeFrom || null, expiresAt: r.expiresAt || null,
              daysActive: normalizeDaysActive(r.daysActive || null),
              windowStart: r.windowStart ?? null, windowEnd: r.windowEnd ?? null,
              amount: toNum(r.amount)
            });
          }
        }
      }

      const ok = inLife && inWindow && hasStock;

      if (ok && r.kind === 'AMOUNT' && !dbg.amount.sampleAccepted) {
        dbg.amount.sampleAccepted = {
          code: r.code,
          usageLimit: limitNum, usedCount: used,
          amount: toNum(r.amount),
          variant: variantOf(r)
        };
      }
      if (ok && r.kind === 'AMOUNT') dbg.amount.active++;

      return ok;
    });

    const keyFor = (r) => {
      const v    = variantOf(r);
      const pct  = toNum(r.percent);
      const pMin = toNum(r.percentMin);
      const pMax = toNum(r.percentMax);
      const amt  = toNum(r.amount);

      if (r.kind === 'PERCENT' && v === 'RANGE' && pMin != null && pMax != null)
        return `RANDOM_PERCENT:${pMin}-${pMax}`;
      if (r.kind === 'PERCENT' && v === 'FIXED' && pct != null)
        return `FIXED_PERCENT:${pct}`;
      if (r.kind === 'AMOUNT'  && v === 'FIXED' && amt != null)
        return `FIXED_AMOUNT:${amt.toFixed(2)}`;
      return null;
    };

    const titleFor = (r) => {
      const v    = variantOf(r);
      const pct  = toNum(r.percent);
      const pMin = toNum(r.percentMin);
      const pMax = toNum(r.percentMax);
      const amt  = toNum(r.amount);

      if (r.kind === 'PERCENT' && v === 'RANGE' && pMin != null && pMax != null) return `${pMin}–${pMax}%`;
      if (r.kind === 'PERCENT' && v === 'FIXED' && pct != null) return `${pct}%`;
      if (r.kind === 'AMOUNT'  && v === 'FIXED' && amt != null) return `${amt.toFixed(2)} €`;
      return 'Cupón';
    };

    const typeFor = (r) => {
      const v = variantOf(r);
      if (r.kind === 'PERCENT' && v === 'RANGE') return 'RANDOM_PERCENT';
      if (r.kind === 'PERCENT' && v === 'FIXED') return 'FIXED_PERCENT';
      if (r.kind === 'AMOUNT'  && v === 'FIXED') return 'FIXED_AMOUNT';
      return 'UNKNOWN';
    };

    const groups = new Map();
    const scoreSample = (r) => {
      const hasDays = normalizeDaysActive(r.daysActive).length > 0;
      const hasWin  = (r.windowStart != null) || (r.windowEnd != null);
      return (hasDays ? 2 : 0) + (hasWin ? 1 : 0);
    };

    for (const r of active) {
      const k = keyFor(r);
      if (!k) continue;

      const cur = groups.get(k) || {
        type: typeFor(r),
        key: k.split(':')[1],
        title: titleFor(r),
        subtitle: (r.kind === 'AMOUNT') ? 'Jugar' : 'Gratis',
        cta:       (r.kind === 'AMOUNT') ? 'Jugar' : 'Gratis',
        remaining: 0,
        sample: null,
        sampleScore: -1
      };

      const used  = toNum(r.usedCount) ?? 0;
      const limitNum = (r.usageLimit == null) ? null : toNum(r.usageLimit);
      if (limitNum == null) {
        cur.remaining = null; // ilimitado
      } else if (cur.remaining !== null) {
        cur.remaining += Math.max(0, limitNum - used);
      }

      const sc = scoreSample(r);
      if (sc > cur.sampleScore) { cur.sample = r; cur.sampleScore = sc; }

      groups.set(k, cur);
    }

    const cards = Array.from(groups.values()).map(g => {
      const s = g.sample || {};
      const constraints = {
        daysActive : normalizeDaysActive(s.daysActive || null),
        windowStart: s.windowStart ?? null,
        windowEnd  : s.windowEnd   ?? null
      };
      const lifetime = {
        activeFrom: s.activeFrom || null,
        expiresAt : s.expiresAt  || null
      };
      return { ...g, constraints, lifetime };
    }).sort((a,b) => a.title.localeCompare(b.title, 'es'));

    res.json({
      ok: true,
      cards,
      types: Array.from(new Set(cards.map(c => c.type))),
      debug: dbg   // ← quítalo cuando acabemos de diagnosticar
    });
  } catch (e) {
    console.error('[coupons.gallery] error', e);
    res.status(500).json({ ok:false, error: 'server' });
  }
});

/* ===========================
 *  GAMES: PRIZE PREVIEW
 * =========================== */
router.get('/games/:gameId/prize', async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isFinite(gameId)) return res.status(400).json({ ok:false, error:'bad_game' });

    const now = nowInTZ();

    const rows = await prisma.coupon.findMany({
      where: {
        status: 'ACTIVE',
        acquisition: 'GAME',
        gameId
      },
      select: {
        kind: true, variant: true, percent: true, percentMin: true, percentMax: true,
        amount: true, maxAmount: true, usageLimit: true, usedCount: true,
        activeFrom: true, expiresAt: true, daysActive: true, windowStart: true, windowEnd: true
      },
      take: 300
    });

    const valid = rows.filter(r => {
      const limit = toNum(r.usageLimit) ?? null;
      const used  = toNum(r.usedCount)  ?? 0;
      const hasStock = (limit == null) ? true : (limit > used);
      return isActiveByDate(r, now) && isWithinWindow(r, now) && hasStock;
    });

    if (!valid.length) return res.json({ ok:true, prize: null });

    const r = valid[0];
    const isRange = r.kind === 'PERCENT' && (toNum(r.percentMin) != null && toNum(r.percentMax) != null);
    const title =
      (r.kind === 'AMOUNT' && r.variant === 'FIXED' && r.amount != null) ? `${Number(r.amount).toFixed(2)} €` :
      (isRange) ? `${r.percentMin}–${r.percentMax}%` :
      (r.kind === 'PERCENT' && r.percent != null) ? `${r.percent}%` :
      'Cupón';

    const remaining = valid.reduce((acc, x) => {
      const limit = toNum(x.usageLimit) ?? null;
      const used  = toNum(x.usedCount)  ?? 0;
      return acc + (limit == null ? 0 : Math.max(0, limit - used)); // si hay ilimitados, reporta solo sum finitos
    }, 0);

    res.json({
      ok: true,
      prize: {
        gameId,
        kind: r.kind,
        variant: r.variant,
        title,
        remaining
      }
    });
  } catch (e) {
    console.error('[games.prize] error', e);
    res.status(500).json({ ok:false, error:'server' });
  }
});

/* ===========================
 *  GAMES: ISSUE FROM POOL
 * =========================== */
router.post('/games/:gameId/issue', requireApiKey, async (req, res) => {
  try {
    const gameId = Number(req.params.gameId);
    if (!Number.isFinite(gameId)) return res.status(400).json({ error:'bad_game' });

    const hours = Number(req.body.hours || 24);
    if (!Number.isFinite(hours) || hours <= 0) return res.status(400).json({ error:'bad_hours' });

    const now = nowInTZ();
    const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);

    // primer cupón válido del pool del juego (admite AMOUNT o PERCENT según lo que tenga el pool)
    const row = await prisma.coupon.findFirst({
      where: {
        status: 'ACTIVE',
        acquisition: 'GAME',
        gameId,
        AND: [
          { OR: [{ usageLimit: null }, { usedCount: { lt: prisma.coupon.fields.usageLimit } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      orderBy: { id: 'asc' }
    });
    if (!row) return res.status(409).json({ error:'out_of_stock' });

    await prisma.coupon.update({
      where: { code: row.code },
      data : {
        expiresAt,
        assignedToId: req.body.customerId ? Number(req.body.customerId) : row.assignedToId ?? null,
        channel: 'GAME',
        campaign: req.body.campaign ?? row.campaign ?? null
      }
    });

    // Notificación opcional al usuario/admin
    const contact     = String(req.body.contact || '').trim();
    const siteUrl     = process.env.COUPON_SITE_URL || 'https://www.mycrushpizza.com';
    const adminPhone  = process.env.ADMIN_PHONE || '';
    const whenTxt     = fmtExpiry(expiresAt);
    const code        = row.code;
    const notify = { user: { tried: false }, admin: { tried: false } };

    if (contact) {
      notify.user.tried = true;
      const userMsg =
        `🎉 ¡Ganaste! Premio del juego: cupón ${code}\n` +
        `Úsalo en ${siteUrl}\n` +
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
      const adminMsg = `ALERTA MCP 🎯 Premio juego #${gameId} emitido: ${code} (vence ${whenTxt})`;
      try {
        const resp = await sendSMS(adminPhone, adminMsg);
        notify.admin.ok  = true;
        notify.admin.sid = resp.sid;
      } catch (err) {
        notify.admin.ok = false;
        notify.admin.error = err.message;
      }
    }

    // respuesta homogénea
    const legacyKind = row.kind === 'AMOUNT' ? LEGACY_FP_LABEL : LEGACY_PERCENT_LABEL;
    return res.json({
      ok: true,
      code,
      kindV2: row.kind,
      amount: row.amount ? Number(row.amount) : null,
      percent: row.kind === 'PERCENT' ? Number(row.percent || 0) : null,
      expiresAt,
      kind: legacyKind,
      value: row.kind === 'AMOUNT' ? Number(row.amount || 0) : Number(row.percent || 0),
      notify
    });
  } catch (e) {
    console.error('[games.issue] error', e);
    res.status(500).json({ ok:false, error:'server' });
  }
});

router.post('/bulk-tag', requireApiKey, async (req, res) => {
  try {
    const {
      filter = {}, // { type, amount, percent, codeStartsWith }
      set = {}     // { acquisition, channel, gameId, campaign }
    } = req.body;

    // construir where desde filtros simples del backoffice
    const where = { };
    if (filter.type === 'FIXED_AMOUNT' && filter.amount != null)
      where.AND = [{ kind: 'AMOUNT' }, { variant: 'FIXED' }, { amount: String(Number(filter.amount)) }];
    if (filter.type === 'FIXED_PERCENT' && filter.percent != null)
      where.AND = [{ kind: 'PERCENT' }, { variant: 'FIXED' }, { percent: Number(filter.percent) }];
    if (filter.codeStartsWith)
      where.code = { startsWith: String(filter.codeStartsWith).toUpperCase() };

    const data = {};
    if (set.acquisition) data.acquisition = String(set.acquisition).toUpperCase();
    if (set.channel)     data.channel     = String(set.channel).toUpperCase();
    if (set.gameId != null) data.gameId   = Number(set.gameId);
    if (set.campaign != null) data.campaign = String(set.campaign);

    const r = await prisma.coupon.updateMany({ where, data });
    return res.json({ ok: true, updated: r.count });
  } catch (e) {
    console.error('[coupons.bulk-tag] error', e);
    res.status(500).json({ ok:false, error:'server' });
  }
});


return router;
};
