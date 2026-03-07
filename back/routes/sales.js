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
      type,
      delivery,
      customer,
      customerId: customerIdBody,
      products,
      extras = [],
      notes = '',
      scheduledFor, 

      // ✅ INCENTIVE (viene del front)
      incentiveId: incentiveIdBody,
      incentiveAmount: incentiveAmountBody,
    } = req.body;

      /* ───────── utilidades ───────── */
      const trimOrNull = (v) => {
        if (v == null) return null;
        const s = String(v).trim();
        return s ? s : null;
      };
      const hasText = (v) => {
        if (v == null) return false;
        return String(v).trim().length > 0;
      };

      const toPriceHard = (v) => {
        if (v == null || v === '') return NaN;
        const cleaned = String(v).trim().replace(/[^0-9,.\-]/g, '').replace(',', '.');
        const parts = cleaned.split('.');
        const normalized =
          parts.length > 2
            ? parts.slice(0, -1).join('') + '.' + parts.slice(-1)
            : cleaned;
        const n = Number(normalized);
        return Number.isFinite(n) ? n : NaN;
      };

      const sanitizeExtra = (e) => {
        const amountNum = toPriceHard(e?.amount);
        if (!Number.isFinite(amountNum)) return null;
        return {
          code: String(e?.code || 'EXTRA'),
          label: String(e?.label || 'Extra'),
          amount: round2(amountNum),
          couponCode: e?.couponCode ? upper(e.couponCode) : undefined,
          percentApplied: e?.percentApplied != null ? Number(e.percentApplied) : undefined,
          amountApplied: e?.amountApplied != null ? Number(e.amountApplied) : undefined,
        };
      };

      const isCoupon = (e) => upper(e.code) === 'COUPON';
      const isDeliveryFee = (e) => upper(e.code) === 'DELIVERY_FEE';
        // ✅ Incentivo como línea informativa (NO afecta total / stock)
        const isIncentiveRewardProduct = (p) => upper(p?.type) === 'INCENTIVE_REWARD';

        // Productos que sí cobran (excluye incentivo)
        const chargeableProducts = Array.isArray(products)
          ? products.filter((p) => !isIncentiveRewardProduct(p))
          : [];
      /* ───────── storeId según rol ───────── */
      let storeId;
      if (req.user.role === 'store') {
        const s = await prisma.store.findFirst({
          where: { storeName: req.user.storeName },
        });
        if (!s) return res.status(403).json({ error: 'Tienda no válida' });
        storeId = s.id;
      } else {
        storeId = Number(storeIdBody);
        if (!storeId) return res.status(400).json({ error: 'storeId requerido' });
      }

      /* ───────── validar productos ───────── */
        if (!Array.isArray(products) || !products.length)
          return res.status(400).json({ error: 'products vacío' });

        // ✅ Validamos SOLO lo cobrable
        for (const p of chargeableProducts) {
          if (![p.pizzaId, p.qty, p.price].every((n) => Number(n) > 0) || !p.size) {
            return res.status(400).json({ error: 'Producto mal formado' });
          }
        }

      /* ───────── resolver cliente (DENTRO TX) ───────── */
      let customerId = null;
      let snapshot = null;

      const resolveCustomer = async (tx) => {
        // 1) customerId explícito
        if (customerIdBody) {
          const cid = Number(customerIdBody);
          if (Number.isFinite(cid) && cid > 0) {
            const dbCustomer = await tx.customer.findUnique({ where: { id: cid } });
            if (dbCustomer) {
              customerId = dbCustomer.id;

              snapshot = {
                phone: dbCustomer.phone ?? null,
                name: dbCustomer.name ?? null,
                address_1: dbCustomer.address_1 ?? null,
                portal: dbCustomer.portal ?? null,
                observations: dbCustomer.observations ?? null,
                lat: dbCustomer.lat ?? null,
                lng: dbCustomer.lng ?? null,
              };

              if (customer && typeof customer === 'object') {
                const patch = {};

                if (hasText(customer.name)) patch.name = trimOrNull(customer.name);
                if (hasText(customer.address_1) || hasText(customer.address))
                  patch.address_1 = trimOrNull(customer.address_1 ?? customer.address);

                if (hasText(customer.observations))
                  patch.observations = trimOrNull(customer.observations);

                if (customer.lat != null) patch.lat = customer.lat;
                if (customer.lng != null) patch.lng = customer.lng;

                if (Object.keys(patch).length) {
                  const updated = await tx.customer.update({
                    where: { id: dbCustomer.id },
                    data: patch,
                  });

                  snapshot = {
                    phone: updated.phone ?? null,
                    name: updated.name ?? null,
                    address_1: updated.address_1 ?? null,
                    portal: updated.portal ?? null,
                    observations: updated.observations ?? null,
                    lat: updated.lat ?? null,
                    lng: updated.lng ?? null,
                  };
                }
              }
              return;
            }
          }
        }

        // 2) upsert por phone
        if (hasText(customer?.phone)) {
          const phone = String(customer.phone).trim();

          const createData = {
            phone,
            name: trimOrNull(customer.name),
            address_1: trimOrNull(customer.address_1 ?? customer.address),
            observations: trimOrNull(customer.observations),
            lat: customer.lat ?? null,
            lng: customer.lng ?? null,
          };

          const updateData = {
            name: trimOrNull(customer.name),
            address_1: trimOrNull(customer.address_1 ?? customer.address),
            lat: customer.lat ?? null,
            lng: customer.lng ?? null,
          };

          if (hasText(customer.observations))
            updateData.observations = trimOrNull(customer.observations);

          const c = await tx.customer.upsert({
            where: { phone },
            update: updateData,
            create: { code: await genCustomerCode(tx), ...createData },
          });

          customerId = c.id;
          snapshot = {
            phone: c.phone ?? null,
            name: c.name ?? null,
            address_1: c.address_1 ?? null,
            portal: c.portal ?? null,
            observations: c.observations ?? null,
            lat: c.lat ?? null,
            lng: c.lng ?? null,
          };
        }
      };

      /* ───────── extras ───────── */
      const nestedExtras = products.flatMap((p) => {

        // 🔥 NO convertir incentivo en extra cobrable
        if (String(p?.type || '').toUpperCase() === 'INCENTIVE_REWARD') {
          return [];
        }

        const qty = Math.max(1, Number(p.qty || 1));

        return (p.extras || [])
          .map(sanitizeExtra)
          .filter(Boolean)
          .map((e) => ({ ...e, amount: round2(e.amount * qty) }));
      });

      const topLevelExtras = extras.map(sanitizeExtra).filter(Boolean);
      let extrasAll = [...nestedExtras, ...topLevelExtras];
console.log('🟠 NESTED EXTRAS:', JSON.stringify(nestedExtras, null, 2));
console.log('🟠 TOP LEVEL EXTRAS:', JSON.stringify(topLevelExtras, null, 2));
console.log('🟠 EXTRAS ALL (final):', JSON.stringify(extrasAll, null, 2));
const totalProducts = round2(
  chargeableProducts.reduce((t, p) => t + Number(p.price) * Number(p.qty), 0)
);

      let discounts = 0;

      const extrasChargeableTotal = round2(
        extrasAll
          .filter((e) => !isCoupon(e) && !isDeliveryFee(e))
          .reduce((s, e) => s + Number(e.amount || 0), 0)
      );

      const deliveryFeeTotal = round2(
        extrasAll.filter(isDeliveryFee).reduce((s, e) => s + Number(e.amount || 0), 0)
      );

      const total = round2(
        totalProducts - discounts + extrasChargeableTotal + deliveryFeeTotal
      );

      /* ───────── transacción ───────── */
      const sale = await prisma.$transaction(async (tx) => {
        await resolveCustomer(tx);

        for (const p of chargeableProducts) {
          const stk = await tx.storePizzaStock.findUnique({
            where: { storeId_pizzaId: { storeId, pizzaId: p.pizzaId } },
          });
          if (!stk || stk.stock < p.qty) {
            throw new Error(`Stock insuficiente para pizza ${p.pizzaId}`);
          }
        }

        const publicCode = await genOrderCode(tx);

        const newSale = await tx.sale.create({
          data: {
            code: publicCode,
            storeId,
            customerId,
            type,
            delivery,
            customerData: snapshot,
            processed: false,
            products,                 // ✅ mantenemos la línea INCENTIVE_REWARD para imprimirla
            extras: extrasAll,
            totalProducts,
            discounts,
            total,
            notes,
            scheduledFor: scheduledFor
              ? new Date(scheduledFor)
              : null,
            // ✅ Incentivo persistido (informativo, no afecta total)
            incentiveId: incentiveIdBody != null ? Number(incentiveIdBody) : null,
            incentiveAmount: incentiveAmountBody != null ? round2(Number(incentiveAmountBody)) : 0,
          },
        });

for (const p of chargeableProducts) {
  await tx.storePizzaStock.update({
    where: { storeId_pizzaId: { storeId, pizzaId: p.pizzaId } },
    data: { stock: { decrement: p.qty } },
  });
}

        return newSale;
      });
console.log('🟢 SALE SAVED:', JSON.stringify(sale, null, 2));
      res.json(sale);
    } catch (err) {
      console.error('[POST /api/sales]', err);
      res.status(400).json({ error: err.message });
    }
  }); 
  /* ─────────────── GET /api/sales/seguimiento/:code (PÚBLICO) ─────────────── */
  r.get('/seguimiento/:code', async (req, res) => {
    try {
      const code = String(req.params.code || '').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ error: 'Código inválido' });
      }

      const sale = await prisma.sale.findUnique({
        where: { code },
        select: {
          code: true,
          status: true,
          processed: true,
          type: true,
          delivery: true,
          date: true,
          store: { select: { storeName: true } }
        }
      });

      if (!sale) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Pedido no encontrado'
        });
      }

      // Solo permitimos seguimiento si está pagado
      if (sale.status !== 'PAID') {
        return res.status(422).json({
          error: 'NOT_PAID',
          message: 'El pedido aún no ha sido confirmado como pagado'
        });
      }

      // ───── estado lógico del pedido ─────
      let stage = 'PREPARING';
      let message = 'Tu pedido está en preparación 🍕';

      if (sale.processed) {
        if (
          String(sale.delivery).toUpperCase() === 'COURIER' ||
          String(sale.type).toUpperCase() === 'DELIVERY'
        ) {
          stage = 'ON_THE_WAY';
          message = 'Tu pedido va en camino 🛵';
        } else {
          stage = 'READY';
          message = 'Tu pedido está listo para recoger 🍕';
        }
      }

      return res.json({
        code: sale.code,
        stage,              // PREPARING | READY | ON_THE_WAY
        message,            // copy listo para UI
        processed: sale.processed,
        type: sale.type,
        delivery: sale.delivery,
        storeName: sale.store?.storeName || 'myCrushPizza',
        createdAt: sale.date
      });

    } catch (e) {
      console.error('[GET /api/sales/seguimiento/:code]', e);
      res.status(500).json({ error: 'internal' });
    }
  });
  /* ─────────────── GET /api/sales/pending ─────────────── */
r.get('/pending', auth(), async (_, res) => {
  try {

    const now = new Date();

    const list = await prisma.sale.findMany({
      where: {
        processed: false,

        NOT: { status: 'AWAITING_PAYMENT' },

        OR: [
          { scheduledFor: null },      // pedido normal
          { scheduledFor: { lte: now } } // pedido programado cuya hora ya llegó
        ]
      },

      orderBy: [
        { scheduledFor: 'asc' }, // primero los programados más cercanos
        { date: 'asc' }          // luego los normales por orden de llegada
      ],

      include: {
        customer: { select: { code: true } }
      }

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

    // marcar como procesado
    const sale = await prisma.sale.update({
      where: { id },
      data: { processed: true },
      include: {
        customer: { select: { phone: true, name: true } }
      }
    });

    // ───── Mensaje según tipo ─────
    const type = (sale.type || '').toUpperCase();

    let statusMsg = 'Tu pedido está listo.';
    if (type === 'DELIVERY') {
      statusMsg = 'Tu pedido va en camino 🛵';
    } else if (type === 'TAKEAWAY' || type === 'LOCAL') {
      statusMsg = 'Tu pedido está listo para recoger 🍕';
    }

    // ───── SMS (best-effort) ─────
    try {
      const phone =
        sale?.customer?.phone ||
        sale?.customerData?.phone ||
        null;

      if (phone) {
        const who   = sale?.customer?.name || sale?.customerData?.name || '';
        const code  = sale?.code ? ` (${sale.code})` : '';
        await sendSMS(phone, `¡${who || 'Hola'}! ${statusMsg}${code}`);
      }
    } catch (smsErr) {
      console.warn('[SMS READY] fallo no bloqueante:', smsErr);
    }

    res.json({ ok: true, message: statusMsg });
  } catch (e) {
    console.error('[PATCH /api/sales/:id/ready]', e);
    res.status(400).json({ error: 'No se pudo marcar como listo' });
  }
});



  return r;
};
