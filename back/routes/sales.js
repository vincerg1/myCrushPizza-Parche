/* eslint-disable consistent-return */
const auth    = require('../middleware/auth');
const sendSMS = require('../utils/sendSMS');

module.exports = (prisma) => {
  const r = require('express').Router();

  /* ───────── helpers comunes (alineados con ventas/coupons) ───────── */
  const TZ = process.env.TIMEZONE || 'Europe/Madrid';
  const round2 = n => Math.round(Number(n) * 100) / 100;

  function nowInTZ() {
    const s = new Date().toLocaleString('sv-SE', { timeZone: TZ });
    return new Date(s.replace(' ', 'T'));
  }
  function minutesOfDay(dateLike) {
    const d = (dateLike instanceof Date) ? dateLike : new Date(dateLike);
    return d.getHours() * 60 + d.getMinutes();
  }
  function normalizeDaysActive(v) {
    if (!v) return [];
    let a = v;
    if (typeof v === 'string') { try { a = JSON.parse(v); } catch { a = [v]; } }
    if (!Array.isArray(a)) a = [a];
    const map = { domingo:0, lunes:1, martes:2, miercoles:3, miércoles:3, jueves:4, viernes:5, sabado:6, sábado:6 };
    const out = [];
    for (const x of a) {
      if (typeof x === 'number' && x >= 0 && x <= 6) out.push(x);
      else {
        const n = map[String(x || '').toLowerCase()];
        if (n != null) out.push(n);
      }
    }
    return Array.from(new Set(out)).sort();
  }
  function isWithinWindow(row, ref = nowInTZ()) {
    const days = normalizeDaysActive(row.daysActive);
    if (!days.length && row.windowStart == null && row.windowEnd == null) return true;
    const day = ref.getDay();
    if (days.length && !days.includes(day)) return false;
    const start = (row.windowStart == null) ? 0 : Number(row.windowStart);
    const end   = (row.windowEnd   == null) ? 24 * 60 : Number(row.windowEnd);
    const m     = minutesOfDay(ref);
    if (start <= end) return m >= start && m < end;
    return m >= start || m < end; // cruza medianoche
  }
  function isActiveByDate(row, ref = nowInTZ()) {
    const t = ref.getTime();
    if (row.activeFrom && new Date(row.activeFrom).getTime() > t) return false;
    if (row.expiresAt && new Date(row.expiresAt).getTime() <= t) return false;
    return true;
  }

  // Prefijos del juego → obligan AMOUNT/FIXED
  const GAME_AMOUNT_PREFIXES = ['MCP-CD'];
  const upper = s => String(s || '').trim().toUpperCase();
  const isGameCoupon = (code) =>
    GAME_AMOUNT_PREFIXES.some(pfx => upper(code).startsWith(pfx));
  function assertGameCouponShape(couponRow, code) {
    if (isGameCoupon(code)) {
      if (!(couponRow?.kind === 'AMOUNT' && couponRow?.variant === 'FIXED')) {
        throw new Error('Cupón del juego inválido: debe ser de valor fijo');
      }
    }
  }

  // Cálculo de descuento (idéntico a ventas.js)
  function computeCouponDiscount(row, totalProducts){
    const tp = Math.max(0, Number(totalProducts||0));
    if (tp <= 0) return { discount:0, percentApplied:null, amountApplied:null, label:null };
    if (row.kind === 'AMOUNT') {
      const amt = Math.max(0, Number(row.amount||0));
      const discount = Math.min(amt, tp);
      return {
        discount: round2(discount),
        percentApplied: null,
        amountApplied: round2(amt),
        label: `Cupón ${row.code} (-€${round2(discount).toFixed(2)})`
      };
    }
    const p = Math.max(0, Number(row.percent||0));
    let discount = tp * (p/100);
    const maxCap = row.maxAmount!=null ? Math.max(0, Number(row.maxAmount)) : null;
    if (maxCap!=null) discount = Math.min(discount, maxCap);
    discount = round2(discount);
    return {
      discount,
      percentApplied: p,
      amountApplied: null,
      label: `Cupón ${row.code} (-${p}%)`
    };
  }

  // Canje atómico + log (versión local de ventas.js)
  async function redeemCouponAtomic(tx, {
    code, saleId, storeId, customerId,
    segmentAtRedeem = null,
    kindSnapshot = null, variantSnapshot = null,
    percentApplied = null, amountApplied = null,
    discountValue = null
  }) {
    const nowRef = nowInTZ();
    const row = await tx.coupon.findUnique({ where: { code } });
    if (!row) return;

    if (row.status === 'DISABLED') return;
    if (!isActiveByDate(row, nowRef)) return;
    if (!isWithinWindow(row, nowRef)) return;
    if ((row.usageLimit ?? 1) <= (row.usedCount ?? 0)) return;

    const inc = await tx.coupon.updateMany({
      where: {
        code,
        status: 'ACTIVE',
        usedCount: { lt: row.usageLimit || 1 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: nowRef } }],
      },
      data: { usedCount: { increment: 1 }, usedAt: nowRef }
    });
    if (inc.count === 0) return;

    const after = await tx.coupon.findUnique({ where: { code } });
    if ((after.usedCount ?? 0) >= (after.usageLimit ?? 1) && after.status !== 'USED') {
      await tx.coupon.update({ where: { code }, data: { status: 'USED' } });
    }

    await tx.couponRedemption.create({
      data: {
        couponId: after.id,
        couponCode: code,
        saleId: saleId || null,
        storeId: storeId || null,
        customerId: customerId || null,
        segmentAtRedeem,
        kind: kindSnapshot || after.kind,
        variant: variantSnapshot || after.variant,
        percentApplied: percentApplied != null ? Number(percentApplied) : (after.kind==='PERCENT' ? Number(after.percent||0) : null),
        amountApplied : amountApplied  != null ? Number(amountApplied)  : (after.kind==='AMOUNT'  ? Number(after.amount||0)  : null),
        discountValue: discountValue != null ? Number(discountValue) : null,
        redeemedAt: nowRef,
        createdAt: nowRef
      }
    });
  }

  async function genOrderCode(db) {
    let code; do { code = 'ORD-' + Math.floor(10000 + Math.random() * 90000); }
    while (await db.sale.findUnique({ where: { code } }));
    return code;
  }
  async function genCustomerCode(db) {
    let code; do { code = 'CUS-' + Math.floor(10000 + Math.random() * 90000); }
    while (await db.customer.findUnique({ where: { code } }));
    return code;
  }

  /* ───────────────────────── POST /api/sales ───────────────────────── */
  r.post('/', auth(), async (req, res) => {
    try {
      const {
        storeId: storeIdBody,
        type, delivery, customer,
        products, extras = [],
        notes = '',
      } = req.body;

      // ── parse de extras y utilidades locales
      const toPriceHard = v => {
        if (v == null || v === '') return NaN;
        const cleaned = String(v).trim().replace(/[^0-9,.\-]/g, '').replace(',', '.');
        const parts = cleaned.split('.');
        const normalized = parts.length > 2
          ? parts.slice(0, -1).join('') + '.' + parts.slice(-1)
          : cleaned;
        const n = Number(normalized);
        return Number.isFinite(n) ? n : NaN;
      };
      const sanitizeExtra = (e) => {
        const amountNum = toPriceHard(e?.amount);
        if (!Number.isFinite(amountNum)) return null;
        return {
          code : String(e?.code || 'EXTRA'),
          label: String(e?.label || 'Extra'),
          amount: round2(amountNum),
          couponCode: e?.couponCode ? upper(e.couponCode) : undefined,
          percentApplied: e?.percentApplied != null ? Number(e.percentApplied) : undefined,
          amountApplied : e?.amountApplied  != null ? Number(e.amountApplied)  : undefined,
        };
      };
      const isCoupon      = (e) => upper(e.code) === 'COUPON';
      const isDeliveryFee = (e) => upper(e.code) === 'DELIVERY_FEE';

      /* storeId según rol ------------------------------ */
      let storeId;
      if (req.user.role === 'store') {
        const s = await prisma.store.findFirst({ where: { storeName: req.user.storeName } });
        if (!s) return res.status(403).json({ error: 'Tienda no válida' });
        storeId = s.id;
      } else {
        storeId = Number(storeIdBody);
        if (!storeId) return res.status(400).json({ error: 'storeId requerido' });
      }

      /* validar productos ------------------------------ */
      if (!Array.isArray(products) || !products.length)
        return res.status(400).json({ error: 'products vacío' });

      for (const p of products) {
        if (![p.pizzaId, p.qty, p.price].every(n => Number(n) > 0) || !p.size)
          return res.status(400).json({ error: 'Producto mal formado' });
      }

      /* upsert cliente --------------------------------- */
      let customerId = null;
      let snapshot   = null;
      if (customer?.phone?.trim()) {
        const data = (({ phone, name, address_1, portal, observations, lat, lng }) => ({
          phone, name, address_1, portal, observations, lat, lng
        }))(customer);

        const c = await prisma.customer.upsert({
          where : { phone: data.phone },
          update: data,
          create: { code: await genCustomerCode(prisma), ...data }
        });

        customerId = c.id;
        snapshot   = data;
      }

      /* extras (aplanar + sanear) ---------------------- */
      const nestedExtras = (Array.isArray(products) ? products : []).flatMap(p => {
        const qty = Math.max(1, Number(p?.qty || 1));
        const exs = Array.isArray(p?.extras) ? p.extras : [];
        return exs.map(e => {
          const se = sanitizeExtra(e);
          if (!se) return null;
          return { ...se, amount: round2(se.amount * qty) };
        }).filter(Boolean);
      });

      const topLevelExtras = (Array.isArray(extras) ? extras : [])
        .map(sanitizeExtra)
        .filter(Boolean);

      // Unión preliminar (la línea COUPON será normalizada abajo)
      let extrasAll = [...nestedExtras, ...topLevelExtras];

      /* totales base ----------------------------------- */
      const totalProducts = round2(
        products.reduce((t, p) => t + Number(p.price) * Number(p.qty), 0)
      );

      // Normalizar CUPÓN (si existe): validar en BD, recalcular descuento y sustituir la línea
      let discounts = 0;
      const couponLineIdx = extrasAll.findIndex(e => isCoupon(e) && e.couponCode);
      if (couponLineIdx >= 0) {
        const code = extrasAll[couponLineIdx].couponCode;
        const coup = await prisma.coupon.findUnique({ where: { code } });
        const nowRef = nowInTZ();

        const valid =
          !!coup &&
          coup.status === 'ACTIVE' &&
          (coup.usageLimit ?? 1) > (coup.usedCount ?? 0) &&
          isActiveByDate(coup, nowRef) &&
          isWithinWindow(coup, nowRef);

if (!valid) {
  const rej = buildCouponRejection(coup, nowRef) || { reason:'INVALID', message:'Cupón inválido' };
  return res.status(422).json({
    error: 'INVALID_COUPON',
    reason: rej.reason,
    message: rej.message,
    details: {
      code,
      activeFrom: coup?.activeFrom, expiresAt: coup?.expiresAt,
      daysActive: normalizeDaysActive(coup?.daysActive),
      windowStart: coup?.windowStart ?? null, windowEnd: coup?.windowEnd ?? null,
      usageLimit: coup?.usageLimit ?? null, usedCount: coup?.usedCount ?? null, usedAt: coup?.usedAt ?? null
    }
  });
}
const shapeErr = assertGameCouponShapeExplain(coup, code);
if (shapeErr){
  return res.status(422).json({ error:'INVALID_COUPON', ...shapeErr, details:{ code } });
}

        // Blindaje por canal de juego
        assertGameCouponShape(coup, code);

        const comp = computeCouponDiscount({ ...coup, code }, totalProducts);
        if (comp.discount > 0) {
          discounts = comp.discount;
          // Sustituimos la línea cupón por una consistente
          extrasAll[couponLineIdx] = {
            code: 'COUPON',
            label: comp.label,
            amount: -comp.discount,
            couponCode: code,
            percentApplied: comp.percentApplied,
            amountApplied : comp.amountApplied
          };
        } else {
          // si no aporta descuento, retiramos la línea
          extrasAll.splice(couponLineIdx, 1);
        }
      }

      const extrasChargeableTotal = round2(
        extrasAll
          .filter(e => !isCoupon(e) && !isDeliveryFee(e))
          .reduce((s, e) => s + (Number(e.amount) || 0), 0)
      );

      const deliveryFeeTotal = round2(
        extrasAll
          .filter(isDeliveryFee)
          .reduce((s, e) => s + (Number(e.amount) || 0), 0)
      );

      const total = round2(totalProducts - discounts + extrasChargeableTotal + deliveryFeeTotal);

      /* transacción ------------------------------------ */
      const sale = await prisma.$transaction(async (tx) => {
        // (a) stock
        for (const p of products) {
          const stk = await tx.storePizzaStock.findUnique({
            where : { storeId_pizzaId: { storeId, pizzaId: p.pizzaId } },
            select: { stock: true }
          });
          if (!stk || stk.stock < p.qty)
            throw new Error(`Stock insuficiente para pizza ${p.pizzaId}`);
        }

        // (b) código público
        const publicCode = await genOrderCode(tx);

        // (c) crear venta
        const newSale = await tx.sale.create({
          data: {
            code: publicCode,
            storeId,
            customerId,
            type,
            delivery,
            customerData : snapshot,
            processed    : false,
            products,
            extras       : extrasAll,   // ya normalizados
            totalProducts,
            discounts    : discounts,   // ignoramos el discounts del body
            total,
            notes
          }
        });

        // (d) restar stock
        for (const p of products) {
          await tx.storePizzaStock.update({
            where:{ storeId_pizzaId:{ storeId, pizzaId:p.pizzaId }},
            data :{ stock:{ decrement:p.qty }}
          });
        }

        // (e) canje cupón si existe (venta de tienda = pago inmediato)
        if (couponLineIdx >= 0) {
          const cLine = extrasAll[couponLineIdx];
          if (cLine?.couponCode) {
            await redeemCouponAtomic(tx, {
              code: cLine.couponCode,
              saleId: newSale.id,
              storeId,
              customerId,
              // snapshots/aplicados ya vienen de computeCouponDiscount:
              percentApplied: cLine.percentApplied ?? null,
              amountApplied : cLine.amountApplied  ?? null,
              discountValue : Math.abs(Number(cLine.amount || 0)) || Number(discounts) || null
            });
          }
        }

        return newSale;
      });

      res.json(sale);

    } catch (err) {
      console.error('[POST /api/sales]', err);
      res.status(400).json({ error: err.message });
    }
  });

  /* ─────────────── GET /api/sales/pending ─────────────── */
  r.get('/pending', auth(), async (_, res) => {
    try {
      const list = await prisma.sale.findMany({
        where: {
          processed: false,
          NOT: { status: 'AWAITING_PAYMENT' }
        },
        orderBy: { date: 'asc' },
        include: { customer: { select: { code: true } } }
      });
      res.json(list);
    } catch (e) {
      console.error('[GET /pending]', e);
      res.status(500).json({ error: 'internal' });
    }
  });
  /* ─────────────── GET /api/sales/today ─────────────── */
  r.get('/today', auth(), async (req, res) => {
    try {
      const TZ = process.env.TIMEZONE || 'Europe/Madrid';

      // inicio y fin del día en TZ
      const start = new Date(
        new Date().toLocaleString('sv-SE', { timeZone: TZ }).split(' ')[0] + 'T00:00:00'
      );
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      // determinar tienda según rol
      let storeId;
      if (req.user.role === 'store') {
        const s = await prisma.store.findFirst({
          where: { storeName: req.user.storeName },
          select: { id: true }
        });
        if (!s) return res.status(403).json({ error: 'Tienda no válida' });
        storeId = s.id;
      } else {
        storeId = Number(req.query.storeId);
        if (!storeId) {
          return res.status(400).json({ error: 'storeId requerido' });
        }
      }

      const sales = await prisma.sale.findMany({
        where: {
          storeId,
          date: {
            gte: start,
            lt: end
          }
        },
        orderBy: { date: 'desc' },
        select: {
          id: true,
          code: true,
          date: true,
          total: true,
          type: true
        }
      });

      res.json(sales);
    } catch (e) {
      console.error('[GET /api/sales/today]', e);
      res.status(500).json({ error: 'internal' });
    }
  });

  /* ─────────────── PATCH /api/sales/:id/ready ─────────────── */
  r.patch('/:id/ready', auth(), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'id inválido' });

      // marcamos la venta como procesada para que deje de aparecer en "pending"
      const sale = await prisma.sale.update({
        where: { id },
        data : { processed: true }, 
        include: { customer: { select: { phone: true, name: true } } }
      });

      // Aviso por SMS (best-effort; no bloquea la respuesta)
      try {
        const phone =
          sale?.customer?.phone ||
          sale?.customerData?.phone ||
          null;

        if (phone) {
          const who   = sale?.customer?.name || sale?.customerData?.name || '';
          const short = sale?.code ? ` ${sale.code}` : '';
          await sendSMS(phone, `¡${who || 'Tu pedido'}${short} está listo!`);
        }
      } catch (smsErr) {
        console.warn('[SMS READY] fallo no bloqueante:', smsErr);
      }

      res.json({ ok: true });
    } catch (e) {
      console.error('[PATCH /api/sales/:id/ready]', e);
      res.status(400).json({ error: 'No se pudo marcar como listo' });
    }
  });


  return r;
};
