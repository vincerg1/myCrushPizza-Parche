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

module.exports = (prisma) => {

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

    // Buscar cupón disponible:
    //  - mismo prefijo
    //  - ACTIVO
    //  - kind = AMOUNT
    //  - variant = FIXED
    //  - con usos disponibles
    //  - sin expirar (expiresAt null o futura)
    const row = await prisma.coupon.findFirst({
      where: {
        code:    { startsWith: prefix },
        status:  'ACTIVE',
        kind:    'AMOUNT',
        variant: 'FIXED',
        usedCount: { lt: prisma.coupon.fields.usageLimit }, // prisma v5: field ref
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { id: 'asc' }
    });

    if (!row) return res.status(409).json({ error: 'out_of_stock' });

    // Marcar la fecha de expiración “dinámica” para este cupón emitido
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

    // Compat legado: si es AMOUNT devolvemos 'FP' (front viejo)
    const legacyKind = row.kind === 'AMOUNT' ? LEGACY_FP_LABEL : LEGACY_PERCENT_LABEL;

    return res.json({
      ok: true,
      code,
      // v2 canónico
      kindV2: row.kind,                 // 'AMOUNT'
      amount: row.amount ? Number(row.amount) : null,
      percent: null,
      expiresAt,
      // compat v1 (front actual)
      kind: legacyKind,                 // 'FP'
      value: row.amount ? Number(row.amount) : 0,
      notify
    });
  } catch (e) {
    console.error('[coupons.issue] error', e);
    return res.status(500).json({ error: 'server' });
  }
});
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

    // Derivar "type" para el front
    const type =
      row.kind === 'PERCENT' && row.variant === 'RANGE' ? 'RANDOM_PERCENT' :
      row.kind === 'PERCENT' && row.variant === 'FIXED' ? 'FIXED_PERCENT'  :
      row.kind === 'AMOUNT'  && row.variant === 'FIXED' ? 'FIXED_AMOUNT'   :
      'UNKNOWN';

    return res.json({
      valid: true,
      // modelo canónico
      kind     : row.kind,        // 'PERCENT' | 'AMOUNT'
      variant  : row.variant,     // 'FIXED' | 'RANGE'
      type,                       // 'RANDOM_PERCENT' | 'FIXED_PERCENT' | 'FIXED_AMOUNT'
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
    // 0) Cargar cupón para validar reglas contextuales
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
    if (Array.isArray(row.segments) && row.segments.length && segmentFromBody && !row.segments.includes(segmentFromBody)) {
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

    // 3) Registrar el canje (best effort)
    (async () => {
      try {
        // Determinar segmento snapshot
        let segmentAtRedeem = segmentFromBody || null;
        if (!segmentAtRedeem && customerId) {
          const c = await prisma.customer.findUnique({
            where: { id: Number(customerId) },
            select: { segment: true }
          });
          if (c?.segment) segmentAtRedeem = c.segment; // S1..S4
        }

        // Definir snapshot de valores aplicados
        const kind    = after.kind;      // 'PERCENT' | 'AMOUNT'
        const variant = after.variant;   // 'FIXED' | 'RANGE'
        let percentApplied = null;
        let amountApplied  = null;

        if (kind === 'PERCENT') {
          // En tu `bulk-generate` fijamos percent al crear; lo registramos tal cual
          percentApplied = Number(after.percent ?? 0) || null;
        } else if (kind === 'AMOUNT') {
          amountApplied = after.amount ? Number(after.amount) : null;
        }

        // Nota: discountValue (en €) es el descuento final aplicado (si ya lo sabes aquí)
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

            discountValue: discountValue != null ? discountValue : null, // € opcional
            redeemedAt: nowRef,
            createdAt: nowRef
          }
        });
      } catch (logErr) {
        // no rompemos el canje si falla el log
        console.error('[coupons.redeem] log redemption error', logErr);
      }
    })();

    return res.json({ ok: true, code });
  } catch (e) {
    console.error('[coupons.redeem] error', e);
    return res.status(500).json({ error: 'server' });
  }
});
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
      return v; // podría venir ya como objeto
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
      // si no viene en label, inferimos por proporción
      const amt = Math.abs(Number(line?.amount || 0));
      if (totalProducts > 0) {
        const rate = amt / totalProducts;
        return rate > 0 && rate <= 1 ? 'PERCENT' : 'AMOUNT';
      }
      return 'AMOUNT';
    };

    // ---- 1) Ventas del rango (impacto real) ----
    const whereSales = {
      date: { gte: from, lte: to },
      status: 'PAID',
      ...(storeId ? { storeId } : {}),
      ...(segment ? { customer: { segment } } : {})  // join con Customer para filtrar por segmento
    };

    const sales = await prisma.sale.findMany({
      where: whereSales,
      select: {
        id: true, date: true, total: true, totalProducts: true, discounts: true,
        extras: true, channel: true, storeId: true
      },
      orderBy: { date: 'asc' }
    });

    // ---- 2) Agregación en memoria a partir de extras ----
    let ordersTotal = 0;
    let ordersWithCoupon = 0;
    let gross = 0;               // totalProducts
    let net = 0;                 // total
    let couponDiscountSum = 0;   // sum(abs(amount)) solo de líneas de cupón

    const byKindCount = { PERCENT: 0, AMOUNT: 0 };
    const topCodeMap = new Map();         // code -> {count}
    const byDayCount = new Map();         // yyyy-mm-dd -> count (ventas con cupón)

    for (const s of sales) {
      ordersTotal += 1;
      gross += Number(s.totalProducts || 0);
      net   += Number(s.total || 0);

      const extras = safeParse(s.extras) || [];
      const couponLines = extras.filter(isCouponLine);
      if (couponLines.length > 0) {
        ordersWithCoupon += 1;

        // sumar descuento de cupón y clasificar
        const totalProducts = Number(s.totalProducts || 0);
        let anyKindCounted = false;

        for (const line of couponLines) {
          const amt = Math.abs(Number(line?.amount || 0));
          couponDiscountSum += amt;

          const k = inferKind(line, totalProducts);
          if (k === 'PERCENT') byKindCount.PERCENT += 1;
          else byKindCount.AMOUNT += 1;
          anyKindCounted = true;

          const code = extractCouponCode(line);
          const cur = topCodeMap.get(code) || { count: 0 };
          cur.count += 1;
          topCodeMap.set(code, cur);
        }

        // serie diaria
        const dayKey = isoDay(s.date);
        byDayCount.set(dayKey, (byDayCount.get(dayKey) || 0) + 1);
      }
    }

    // Serie continua en el rango
    const days = [];
    for (let t = new Date(from); t <= to; t = new Date(t.getTime() + 864e5)) {
      const key = t.toISOString().slice(0,10);
      days.push({ day: key, value: byDayCount.get(key) || 0 });
    }

    // Top 5 códigos
    const byCodeTop = Array
      .from(topCodeMap.entries())
      .map(([code, v]) => ({ code, count: v.count }))
      .sort((a,b) => b.count - a.count)
      .slice(0,5);

    // By kind
    const byKind = [
      ...(byKindCount.PERCENT ? [{ kind: 'PERCENT', count: byKindCount.PERCENT }] : []),
      ...(byKindCount.AMOUNT  ? [{ kind: 'AMOUNT',  count: byKindCount.AMOUNT  }] : [])
    ];

    // ---- 3) Emitidos (mantenemos este KPI como antes para compatibilidad) ----
    const issued = await prisma.coupon.count({
      where: { createdAt: { gte: from, lte: to } }
    });

    // ---- 4) Construcción de respuesta (MISMAS CLAVES) ----
    const kpi = {
      issued,
      redeemed: ordersWithCoupon,                           // ahora = pedidos con cupón
      redemptionRate: issued > 0 ? ordersWithCoupon / issued : null,
      discountTotal: Number(couponDiscountSum || 0),        // € de cupón aplicado
      byKind,
      byCodeTop,
      dailySpark: days
    };

    return res.json({ ok: true, range: { from, to }, storeId, segment, kpi });
  } catch (e) {
    console.error('[coupons.metrics] error', e);
    return res.status(500).json({ ok: false, error: 'server' });
  }
});
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
router.get('/gallery', async (_req, res) => {
  try {
    const now = nowInTZ();

    // 1) Traer solo lo necesario y con stock disponible
    const rows = await prisma.coupon.findMany({
      where: {
        status: 'ACTIVE',
        usedCount: { lt: prisma.coupon.fields.usageLimit },
      },
      select: {
        code: true, kind: true, variant: true,
        percent: true, percentMin: true, percentMax: true,
        amount: true, maxAmount: true,

        // restricciones diarias
        daysActive: true, windowStart: true, windowEnd: true,

        // vida útil
        activeFrom: true, expiresAt: true,

        // stock
        usageLimit: true, usedCount: true,
      },
      orderBy: { id: 'asc' }
    });

    // 2) Filtrar por vida útil + ventana diaria actuales
    const active = rows.filter(r => isActiveByDate(r, now) && isWithinWindow(r, now));

    // 3) Helpers de agrupación
    const keyFor = (r) => {
      if (r.kind === 'PERCENT' && r.variant === 'RANGE')  return `RANDOM_PERCENT:${r.percentMin}-${r.percentMax}`;
      if (r.kind === 'PERCENT' && r.variant === 'FIXED')  return `FIXED_PERCENT:${r.percent}`;
      if (r.kind === 'AMOUNT'  && r.variant === 'FIXED')  return `FIXED_AMOUNT:${Number(r.amount).toFixed(2)}`;
      return 'UNKNOWN';
    };
    const titleFor = (r) => {
      if (r.kind === 'PERCENT' && r.variant === 'RANGE')  return `${r.percentMin}–${r.percentMax}%`;
      if (r.kind === 'PERCENT' && r.variant === 'FIXED')  return `${r.percent}%`;
      if (r.kind === 'AMOUNT'  && r.variant === 'FIXED')  return `${Number(r.amount).toFixed(2)} €`;
      return 'Cupón';
    };
    const typeFor = (r) =>
      (r.kind === 'PERCENT' && r.variant === 'RANGE') ? 'RANDOM_PERCENT' :
      (r.kind === 'PERCENT' && r.variant === 'FIXED') ? 'FIXED_PERCENT'  :
      (r.kind === 'AMOUNT'  && r.variant === 'FIXED') ? 'FIXED_AMOUNT'   : 'UNKNOWN';

    // 4) Agrupar acumulando “remaining” y el mejor sample por restricciones
    const groups = new Map(); // key -> state
    const scoreSample = (r) => {
      // Preferimos cupones con restricciones visibles para mostrarlas en la tarjeta
      const hasDays = normalizeDaysActive(r.daysActive).length > 0;
      const hasWin  = (r.windowStart != null) || (r.windowEnd != null);
      // Mayor score = más preferible
      return (hasDays ? 2 : 0) + (hasWin ? 1 : 0);
    };

    for (const r of active) {
      const k = keyFor(r);
      const cur = groups.get(k) || {
        type: typeFor(r),
        key: k.split(':')[1],
        title: titleFor(r),
        subtitle: (r.kind === 'AMOUNT') ? 'Jugar' : 'Gratis',
        cta:       (r.kind === 'AMOUNT') ? 'Jugar' : 'Gratis',
        remaining: 0,
        sample: null,      // almacenará el cupón “representativo” del grupo
        sampleScore: -1
      };

      // sumatorio de unidades disponibles
      cur.remaining += Math.max(0, (r.usageLimit ?? 1) - (r.usedCount ?? 0));

      // seleccionar el mejor “sample”
      const sc = scoreSample(r);
      if (sc > cur.sampleScore) {
        cur.sample = r;
        cur.sampleScore = sc;
      }

      groups.set(k, cur);
    }

    // 5) Construir tarjetas: constraints (ventana diaria) + lifetime (vida útil) del sample
    const cards = Array.from(groups.values())
      .map(g => {
        const s = g.sample || {};
        const days = normalizeDaysActive(s.daysActive || null);
        const constraints = {
          daysActive: days,
          windowStart: s.windowStart ?? null,
          windowEnd:   s.windowEnd   ?? null
        };
        const lifetime = {
          activeFrom: s.activeFrom || null,
          expiresAt : s.expiresAt  || null
        };
        return {
          type: g.type,
          key: g.key,
          title: g.title,
          subtitle: g.subtitle,
          cta: g.cta,
          remaining: g.remaining,
          constraints,
          lifetime
        };
      })
      .sort((a,b) => a.title.localeCompare(b.title, 'es'));

    res.json({ ok: true, cards });
  } catch (e) {
    console.error('[coupons.gallery] error', e);
    res.status(500).json({ ok:false, error: 'server' });
  }
});




  return router;
};
