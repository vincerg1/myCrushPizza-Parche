'use strict';

const express = require('express');
const router  = express.Router();

/* ───────── Stripe: carga segura + logs ───────── */
let StripeSDK = null, stripe = null, stripeReady = false;
try {
  StripeSDK = require('stripe');
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('[venta] STRIPE_SECRET_KEY no configurada; endpoints de pago devolverán 503');
  } else {
    stripe = new StripeSDK(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    stripeReady = true;
    console.info('[venta] Stripe SDK cargado ✓');
  }
} catch { console.warn('[venta] Falta paquete "stripe" (npm i stripe)'); }

// Twilio (SMS)
const sendSMS = require('../utils/sendSMS');

/* ───────── logs & utils básicos ───────── */
const ts  = () => new Date().toISOString();
const logI = (m, x={}) => console.info(`[venta][${ts()}] ${m}`, x);
const logW = (m, x={}) => console.warn(`[venta][${ts()}] ${m}`, x);
const logE = (m, e)     => console.error(`[venta][${ts()}] ${m}`, e?.message || e);
const FRONT_BASE_URL = process.env.FRONT_BASE_URL || 'http://localhost:3000';
const onlyDigits = s => (s || '').replace(/\D/g, '');
const clean = v => (v === undefined || v === '' ? null : v);
const upper = s => String(s || '').trim().toUpperCase();
const toPrice = v => {
  if (v == null || v === '') return NaN;
  const cleaned = String(v).trim().replace(/[^0-9,.\-]/g, '').replace(',', '.');
  const parts = cleaned.split('.');
  const normalized = parts.length > 2
    ? parts.slice(0, -1).join('') + '.' + parts.slice(-1)
    : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
};
const parseMaybe = (v, fb = {}) => { try { return v==null?fb : (typeof v==='string' ? JSON.parse(v) : v); } catch { return fb; } };
const round2 = n => Math.round(Number(n) * 100) / 100;
const DELIVERY_MAX_KM = Number(process.env.DELIVERY_MAX_KM ?? 7);
function haversineKm(lat1, lon1, lat2, lon2){
  const R=6371,toRad=d=>(d*Math.PI)/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
const normPhone = (s='') => s.replace(/[^\d+]/g, '');
async function getRestrictionByPhone(db, rawPhone) {
  const phone = normPhone(rawPhone || '');
  if (!phone) return { restricted:false };
  const c = await db.customer.findUnique({
    where: { phone },
    select: { isRestricted:true, restrictionReason:true, code:true }
  });
  return {
    restricted: !!c?.isRestricted,
    reason    : c?.restrictionReason || null,
    code      : c?.code || null
  };
}
async function genOrderCode(db){ let code; do{ code='ORD-'+Math.floor(10000+Math.random()*90000);} while(await db.sale.findUnique({where:{code}})); return code; }
async function genCustomerCode(db){ let code; do{ code='CUS-'+Math.floor(10000+Math.random()*90000);} while(await db.customer.findUnique({where:{code}})); return code; }
const firstName = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  const cleanName = raw.replace(/\s+/g, ' ').trim();
  if (!cleanName) return '';
  const [w] = cleanName.split(' ');
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
};
function buildPaidMsg({ name, code, storeName, isDelivery }) {
  const saludo = name ? `Hola ${firstName(name)}, ` : 'Hola, ';
  return isDelivery
    ? `${saludo}hemos recibido tu pago del pedido ${code}. Lo estamos preparando en ${storeName}. Te avisaremos cuando salga a reparto. ¡Gracias!`
    : `${saludo}hemos recibido tu pago del pedido ${code}. Lo estamos preparando en ${storeName}. Te avisaremos cuando esté listo para recoger. ¡Gracias!`;
}
const TZ = process.env.TIMEZONE || 'Europe/Madrid';
function nowInTZ() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: TZ }); // “YYYY-MM-DD HH:mm:ss”
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
function computeCouponDiscount(row, totalProducts){
  const tp = Math.max(0, Number(totalProducts||0));
  if(tp<=0) return { discount:0, percentApplied:null, amountApplied:null, label:null };
  if(row.kind === 'AMOUNT'){
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
  if(maxCap!=null) discount = Math.min(discount, maxCap);
  discount = round2(discount);
  return {
    discount,
    percentApplied: p,
    amountApplied: null,
    label: `Cupón ${row.code} (-${p}%)`
  };
}
async function normalizeItems(db, items){
  const src = Array.isArray(items) ? items : [];
  if (!src.length) throw new Error('items vacío');

  const direct = [];
  const namesNeeded = new Set();
  const originalKinds = [];

  for (const i of src){
    const raw = i.pizzaId ?? i.id ?? i.name ?? i.pizzaName;
    const key = String(raw ?? '').trim();
    const size = upper(i.size || 'M');
    const qty  = Math.max(1, Number(i.qty || 1));
    if (!key) throw new Error('Ítem inválido: id/nombre vacío');

    if (/^\d+$/.test(key)){
      direct.push({ pizzaId: Number(key), size, qty });
      originalKinds.push({ kind:'id', key, size, qty });
    } else {
      namesNeeded.add(key);
      originalKinds.push({ kind:'name', key, size, qty });
    }
  }

  let nameToId = new Map();
  if (namesNeeded.size){
    const rows = await db.menuPizza.findMany({
      where: { name: { in: Array.from(namesNeeded) } },
      select: { id:true, name:true }
    });
    nameToId = new Map(rows.map(r => [r.name, r.id]));
  }

  const byName = [];
  for (const k of originalKinds){
    if (k.kind === 'name'){
      const pid = nameToId.get(k.key);
      if (!pid) throw new Error(`Ítem inválido: nombre "${k.key}" no encontrado en MenuPizza`);
      byName.push({ pizzaId: Number(pid), size: k.size, qty: k.qty });
    }
  }

  return [...direct, ...byName];
}
async function assertStock(tx, storeId, items){
  for (const it of items){
    const stk = await tx.storePizzaStock.findUnique({
      where : { storeId_pizzaId: { storeId: Number(storeId), pizzaId: Number(it.pizzaId) } },
      select: { stock:true }
    });
    if (!stk || stk.stock < Number(it.qty)){
      throw new Error(`Stock insuficiente para pizza ${it.pizzaId}`);
    }
  }
}
async function recalcTotals(tx, storeId, items){
  const ids = [...new Set(items.map(i => Number(i.pizzaId)))];
  const pizzas = await tx.menuPizza.findMany({ where: { id: { in: ids } } });

  let totalProducts = 0;
  const lineItems = items.map(it => {
    const mp = pizzas.find(p => p.id === Number(it.pizzaId));
    if (!mp) throw new Error(`Pizza ${it.pizzaId} no existe`);
    const sizeKey = upper(it.size || 'M');
    const priceMap = parseMaybe(mp.priceBySize, {});
    const price = toPrice(priceMap[sizeKey]);
    if (!Number.isFinite(price)) throw new Error(`Precio no definido para ${mp.name} (${sizeKey})`);
    const qty = Math.max(1, Number(it.qty || 1));
    totalProducts += price * qty;
    return { pizzaId: mp.id, size: sizeKey, qty, price };
  });

  return { lineItems, totalProducts, total: totalProducts };
}

const GAME_AMOUNT_PREFIXES = ['MCP-CD']; // cupones emitidos por el juego
const isGameCoupon = (code) =>
  GAME_AMOUNT_PREFIXES.some(pfx => String(code || '').toUpperCase().startsWith(pfx));
const assertGameCouponShape = (coup, code) => {
  if (isGameCoupon(code)) {
    if (!(coup?.kind === 'AMOUNT' && coup?.variant === 'FIXED')) {
      throw new Error('Cupón del juego inválido: debe ser valor fijo');
    }
  }
};

/* ───────────────────────────────────────────────────────────── */
module.exports = (prisma) => {


router.post('/pedido', async (req, res) => {
  const appMeta = await prisma.appMeta.findUnique({ where: { id: 1 } }).catch(() => null);
  if (appMeta && appMeta.acceptingOrders === false) {
    const msg = appMeta.closedMessage || 'Ahora mismo estamos cerrados. Volvemos pronto 🙂';
    return res.status(503).json({ error: msg });
  }

  const {
    storeId,
    type = 'DELIVERY',
    delivery = 'COURIER',
    customer,
    items = [],
    extras = [],
    notes = '',
    channel = 'WHATSAPP',
    coupon: rawCoupon,
    couponCode: rawCouponCode
  } = req.body || {};
  logI('POST /pedido ←', { storeId, items: items?.length || 0, channel, type, delivery, coupon: rawCoupon || rawCouponCode });

  try {
    if (!storeId) return res.status(400).json({ error: 'storeId requerido' });

    // Cobertura (solo delivery)
    if (customer?.phone?.trim()) {
      const r = await getRestrictionByPhone(prisma, customer.phone);
      if (r.restricted) {
        return res.status(403).json({ error: 'restricted', code: r.code, reason: r.reason });
      }
    }
    if (String(delivery).toUpperCase() === 'COURIER') {
      const lat = Number(customer?.lat), lng = Number(customer?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: 'Faltan coordenadas del cliente (lat/lng) para calcular cobertura.' });
      }
      const activeStores = await prisma.store.findMany({
        where: { active: true, latitude: { not: null }, longitude: { not: null } },
        select: { id: true, latitude: true, longitude: true }
      });
      if (!activeStores.length) return res.status(400).json({ error: 'No hay tiendas activas configuradas con ubicación.' });

      let nearest = { id: null, km: Infinity };
      for (const s of activeStores) {
        const km = haversineKm(lat, lng, Number(s.latitude), Number(s.longitude));
        if (km < nearest.km) nearest = { id: s.id, km };
      }
      if (!nearest || nearest.km > DELIVERY_MAX_KM) {
        logW('Pedido fuera de cobertura', { lat, lng, nearestKm: Number(nearest?.km?.toFixed?.(2) ?? 'NaN'), limitKm: DELIVERY_MAX_KM, nearestStoreId: nearest?.id || null });
        return res.status(400).json({ error: `Esta dirección está fuera de la zona de servicio (máx ${DELIVERY_MAX_KM} km).` });
      }
    }

    // Cliente
    let customerId = null, snapshot = null;
    const isDelivery =
      String(type).toUpperCase() === 'DELIVERY' ||
      String(delivery).toUpperCase() === 'COURIER';

    if (customer?.phone?.trim()) {
      const phone = onlyDigits(customer.phone);
      const name = (customer.name || '').trim();

      const createAddress = isDelivery
        ? (customer.address_1 || 'SIN DIRECCIÓN')
        : `(PICKUP) ${phone}`;

      const c = await prisma.customer.upsert({
        where: { phone },
        update: {
          phone,
          name,
          ...(isDelivery && {
            address_1: customer.address_1 || 'SIN DIRECCIÓN',
            lat: clean(customer.lat),
            lng: clean(customer.lng),
          }),
          portal: clean(customer.portal),
          observations: clean(customer.observations),
        },
        create: {
          code: await genCustomerCode(prisma),
          phone,
          name,
          address_1: createAddress,
          portal: clean(customer.portal),
          observations: clean(customer.observations),
          lat: isDelivery ? clean(customer.lat) : null,
          lng: isDelivery ? clean(customer.lng) : null,
        },
      });
      customerId = c.id;
      snapshot = {
        phone: c.phone, name: c.name,
        address_1: c.address_1, portal: c.portal, observations: c.observations,
        lat: c.lat, lng: c.lng
      };
    }

    // Ítems (solo pizzas base/size/qty/precio)
    const normItems = await normalizeItems(prisma, items);

    // Extras desde ítems (aplanados) + embebidos para cada línea
    const collectExtrasFromItems = (rawItems = []) => {
      const out = [];
      for (const it of (Array.isArray(rawItems) ? rawItems : [])) {
        const qty = Math.max(1, Number(it?.qty || 1));
        const pools = []
          .concat(it?.extras || [])
          .concat(it?.toppings || [])
          .concat(it?.addOns || it?.addons || [])
          .concat(it?.options || [])
          .concat(it?.modifiers || [])
          .concat(it?.ingredients || [])
          .concat(it?.complements || [])
          .concat(it?.sides || []);
        for (const ex of pools) {
          const parsed = [ex?.amount, ex?.price, ex?.delta].map(toPrice).find(Number.isFinite);
          if (!Number.isFinite(parsed) || parsed < 0) continue;
          const code = upper(ex?.code || ex?.id || ex?.key || ex?.name || 'EXTRA');
          const label = String(ex?.label || ex?.name || ex?.title || code);
          out.push({ code, label, amount: round2(parsed * qty) });
        }
      }
      return out;
    };
    const unitExtrasForItem = (it = {}) => {
      const pools = []
        .concat(it?.extras || [])
        .concat(it?.toppings || [])
        .concat(it?.addOns || it?.addons || [])
        .concat(it?.options || [])
        .concat(it?.modifiers || [])
        .concat(it?.ingredients || [])
        .concat(it?.complements || [])
        .concat(it?.sides || []);
      return pools
        .map((ex) => {
          const parsed = [ex?.amount, ex?.price, ex?.delta].map(toPrice).find(Number.isFinite);
          if (!Number.isFinite(parsed) || parsed < 0) return null;
          const id = Number(ex?.id ?? ex?.pizzaId ?? ex?.productId ?? 0) || undefined;
          const label = String(ex?.label || ex?.name || ex?.title || 'Extra');
          return { id, code: 'EXTRA', label, amount: round2(parsed) };
        })
        .filter(Boolean);
    };

    const created = await prisma.$transaction(async (tx) => {
      await assertStock(tx, Number(storeId), normItems);
      const { lineItems, totalProducts } = await recalcTotals(tx, Number(storeId), normItems);

      const itemExtras = collectExtrasFromItems(items);
      const lineItemsWithExtras = (Array.isArray(lineItems) ? lineItems : []).map((li, idx) => ({
        ...li,
        extras: unitExtrasForItem(items[idx]) || [],
      }));

      const orderLevelExtras = (Array.isArray(extras) ? extras : [])
        .map(ex => {
          const amountNum = toPrice(ex?.amount);
          const amount = Number.isFinite(amountNum) ? round2(amountNum) : NaN;
          if (!Number.isFinite(amount)) return null;
          return { code: String(ex?.code || 'EXTRA'), label: String(ex?.label || 'Extra'), amount };
        })
        .filter(Boolean);

      const extrasSanitized = [...itemExtras, ...orderLevelExtras];

      // Cupón (preview) — sin canjear
      let discounts = 0;
      let couponEntry = null;
      const couponCode = upper(rawCoupon || rawCouponCode || '');
      if (couponCode) {
        const coup = await tx.coupon.findUnique({ where: { code: couponCode } });
        const nowRef = nowInTZ();

        // Validación fuerte (activa/fechas/ventana/uso)
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
            code: couponCode,
            activeFrom: coup?.activeFrom, expiresAt: coup?.expiresAt,
            daysActive: normalizeDaysActive(coup?.daysActive),
            windowStart: coup?.windowStart ?? null, windowEnd: coup?.windowEnd ?? null,
            usageLimit: coup?.usageLimit ?? null, usedCount: coup?.usedCount ?? null, usedAt: coup?.usedAt ?? null
          }
        });
      }
      const shapeErr = assertGameCouponShapeExplain(coup, couponCode);
      if (shapeErr){
        return res.status(422).json({ error:'INVALID_COUPON', ...shapeErr, details:{ code: couponCode } });
      }

if (discount <= 0){
  return res.status(422).json({
    error:'INVALID_COUPON',
    reason:'NO_DISCOUNT',
    message:'El cupón no aplica a este carrito.'
  });
}


        // 🚦 Blindaje adicional: si es del juego (MCP-CD), exigir AMOUNT/FIXED
        assertGameCouponShape(coup, couponCode);

        const { discount, percentApplied, amountApplied, label } =
          computeCouponDiscount({ ...coup, code: couponCode }, totalProducts);

        if (discount > 0) {
          discounts = discount;
          couponEntry = {
            code: 'COUPON',
            label,
            amount: -discounts,
            couponCode,
            percentApplied,
            amountApplied
          };
        }
      }

      const extrasFinal = couponEntry ? [...extrasSanitized, couponEntry] : extrasSanitized;

      const extrasChargeableTotal = round2(
        extrasSanitized.reduce((s, e) => s + (Number(e.amount) || 0), 0)
      );

      logI('PRODUCTS & TOTALS', {
        totalProducts,
        discountsPreview: discounts,
        saleTotalPreview: round2(totalProducts - discounts + extrasChargeableTotal)
      });

      const saleTotal = round2(totalProducts - discounts + extrasChargeableTotal);

      const sale = await tx.sale.create({
        data: {
          code: await genOrderCode(tx),
          storeId: Number(storeId),
          customerId,
          type,
          delivery,
          customerData: snapshot,
          products: lineItemsWithExtras,
          totalProducts,
          discounts,
          total: saleTotal,
          extras: extrasFinal,
          notes,
          channel,
          status: 'AWAITING_PAYMENT',
          address_1: snapshot?.address_1 ?? null,
          lat: snapshot?.lat ?? null,
          lng: snapshot?.lng ?? null,
        },
        select: { id: true, code: true, total: true, currency: true, discounts: true },
      });
      return sale;
    });

    const storeRow = await prisma.store.findUnique({
      where: { id: Number(storeId) },
      select: { id: true, acceptingOrders: true, storeName: true }
    });
    if (!storeRow) return res.status(400).json({ error: 'storeId inválido' });
    if (!storeRow.acceptingOrders) {
      return res.status(403).json({ error: 'La tienda no está aceptando pedidos ahora mismo.' });
    }

    logI('→ pedido creado', created);
    res.json(created);
  } catch (e) {
    logE('[POST /api/venta/pedido] error', e);
    res.status(400).json({ error: e.message });
  }
});
router.post('/checkout-session', async (req, res) => {
    if (!stripeReady){
      logW('checkout-session llamado sin Stripe listo');
      return res.status(503).json({ error:'Stripe no configurado' });
    }

    try{
      const { orderId, code, cart } = req.body || {};

      /* ---------- B1) Venta previa ---------- */
      if (orderId || code){
        const where = orderId ? { id:Number(orderId) } : { code:String(code) };
        const sale = await prisma.sale.findUnique({ where });
        if (!sale)  return res.status(404).json({ error:'Pedido no existe' });
        if (sale.status === 'PAID') return res.status(400).json({ error:'Pedido ya pagado' });

        // restricción por teléfono (anti-abuso)
        let restrictedInfo = { restricted:false };
        const snapPhone = sale?.customerData?.phone || null;
        if (snapPhone) {
          restrictedInfo = await getRestrictionByPhone(prisma, snapPhone);
        } else if (sale.customerId) {
          const c = await prisma.customer.findUnique({
            where: { id: sale.customerId },
            select: { phone:true, isRestricted:true, restrictionReason:true, code:true }
          });
          restrictedInfo = {
            restricted: !!c?.isRestricted,
            reason: c?.restrictionReason || null,
            code: c?.code || null
          };
        }
        if (restrictedInfo.restricted) {
          return res.status(403).json({ error:'restricted', code: restrictedInfo.code, reason: restrictedInfo.reason });
        }

        const productsJson = Array.isArray(sale.products) ? sale.products : parseMaybe(sale.products, []);
        const extrasJson   = Array.isArray(sale.extras)   ? sale.extras   : parseMaybe(sale.extras,   []);

        let sessionUrl = null;

        await prisma.$transaction(async (tx) => {
          await assertStock(tx, sale.storeId, productsJson);
          const { lineItems, total } = await recalcTotals(tx, sale.storeId, productsJson);

          // nombres por id
          const ids = [...new Set(lineItems.map(li => Number(li.pizzaId)).filter(Boolean))];
          let nameById = new Map();
          if (ids.length){
            const pizzas = await tx.menuPizza.findMany({ where:{ id:{ in: ids } }, select:{ id:true, name:true } });
            nameById = new Map(pizzas.map(p => [p.id, p.name]));
          }

          const currency = String(sale.currency || 'EUR').toLowerCase();

          // prorrateo de descuento SOLO sobre productos
          const totalProductsOriginal = Number(total);
          const discountAmount = Number(sale.discounts || 0);
          const discountFraction = (totalProductsOriginal > 0 && discountAmount > 0)
            ? (discountAmount / totalProductsOriginal)
            : 0;

          const productLines = lineItems.map(li => {
            const qty = Math.max(1, Number(li.qty || 1));
            const baseName = `${(nameById.get(Number(li.pizzaId)) || `#${li.pizzaId}`)}${li.size ? ` (${li.size})` : ''}`;
            const displayName = qty > 1 ? `${baseName} ×${qty}` : baseName;
            const unitCents = Math.round(Number(li.price) * 100);
            const discountedCents = discountFraction > 0
              ? Math.max(0, Math.round(unitCents * (1 - discountFraction)))
              : unitCents;

            return {
              quantity: qty,
              price_data: {
                currency,
                unit_amount: discountedCents,
                product_data: {
                  name: displayName,
                  metadata: { pizzaId:String(li.pizzaId ?? ''), size:String(li.size ?? '') }
                }
              }
            };
          });

          // --- EXTRAS ---
          const extrasArray = Array.isArray(extrasJson) ? extrasJson : [];
          const deliveryFeeExtras = extrasArray.filter(ex => String(ex?.code || '').toUpperCase() === 'DELIVERY_FEE');
          const shippingAmountCentsFromExtras = deliveryFeeExtras.length
            ? Math.round(deliveryFeeExtras.reduce((s,e)=> s + (toPrice(e?.amount) || 0), 0) * 100)
            : 0;

          // Envío
          let shippingAmountCents = 0;
          if (String(sale.delivery).toUpperCase() === 'COURIER'){
            if (shippingAmountCentsFromExtras > 0){
              shippingAmountCents = shippingAmountCentsFromExtras;
            } else {
              const totalQty = productLines.reduce((s,li)=> s + Number(li.quantity||0), 0);
              const blocks = Math.ceil(totalQty / 5);
              shippingAmountCents = blocks * 250; // 2.50 €
            }
          }

          // Otros extras cobrables como line_items (excluye COUPON y DELIVERY_FEE)
          const extrasLineItems = [];
          let extrasOtherCents = 0;
          for (const ex of extrasArray){
            const code = String(ex?.code || '').toUpperCase();
            if (code === 'COUPON' || code === 'DELIVERY_FEE') continue;
            const amt = toPrice(ex?.amount);
            if (!Number.isFinite(amt)) continue;
            const cents = Math.round(amt * 100);
            if (cents <= 0) continue;

            extrasOtherCents += cents;
            extrasLineItems.push({
              quantity: 1,
              price_data: {
                currency,
                unit_amount: cents,
                product_data: {
                  name: String(ex?.label || ex?.code || 'Extra'),
                  metadata: { extraCode: String(ex?.code || '') }
                }
              }
            });
          }

          const pmTypes = ['card'];
          if (process.env.STRIPE_ENABLE_LINK   === '1') pmTypes.push('link');
          if (process.env.STRIPE_ENABLE_KLARNA === '1') pmTypes.push('klarna');

          const shippingOptions =
            shippingAmountCents > 0
              ? [{
                  shipping_rate_data:{
                    display_name:'Gastos de envío',
                    type:'fixed_amount',
                    fixed_amount:{ amount:shippingAmountCents, currency }
                  }
                }]
              : undefined;

          // Fallback
          const productsCentsSent = productLines.reduce((s,li) => s + (Number(li.price_data?.unit_amount||0) * Number(li.quantity||0)), 0);
          const itemsAlreadyCentsNoShipping = productsCentsSent + extrasOtherCents;
          const declaredSaleCents = Math.round(Number(sale.total || 0) * 100);
          const declaredNoShippingCents = Math.max(0, declaredSaleCents - shippingAmountCentsFromExtras);
          let missingExtrasCents = declaredNoShippingCents - itemsAlreadyCentsNoShipping;

          if (missingExtrasCents >= 1) {
            extrasLineItems.push({
              quantity: 1,
              price_data: {
                currency,
                unit_amount: missingExtrasCents,
                product_data: {
                  name: 'Extras',
                  metadata: { kind: 'FALLBACK_EXTRAS_FROM_SALE_TOTAL' }
                }
              }
            });
            extrasOtherCents += missingExtrasCents;
            logW('Añadido fallback de extras', { missingExtrasCents, declaredNoShippingCents, itemsAlreadyCentsNoShipping });
          }

          // Sesión Stripe
          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: pmTypes,
            line_items: [
              ...productLines,
              ...extrasLineItems,
            ],
            customer_email: sale.customerData?.email || undefined,
            billing_address_collection: 'auto',
            locale: 'es',
            ...(shippingOptions ? { shipping_options: shippingOptions } : {}),
            success_url: `${FRONT_BASE_URL}/venta/result?status=success&order=${encodeURIComponent(sale.code)}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${FRONT_BASE_URL}/venta/result?status=cancel&order=${encodeURIComponent(sale.code)}&session_id={CHECKOUT_SESSION_ID}`,
            metadata: { saleId: String(sale.id), saleCode: sale.code || '', type: sale.type, delivery: sale.delivery }
          });

          // total real enviado a Stripe
          const totalForDb = (productsCentsSent + extrasOtherCents + (shippingOptions ? shippingAmountCents : 0)) / 100;
          await tx.sale.update({
            where:{ id:sale.id },
            data : {
              total: round2(totalForDb),
              stripeCheckoutSessionId: session.id,
              status:'AWAITING_PAYMENT'
            }
          });

          logI('→ Stripe session creada (venta previa) con extras', {
            id: session.id,
            saleId: sale.id,
            declaredSaleCents,
            productsCentsSent,
            extrasOtherCents,
            shippingAmountCentsSent: shippingOptions ? shippingAmountCents : 0
          });

          sessionUrl = session.url;
        });

        return res.json({ url: sessionUrl });
      }

      /* ---------- B2) Modo carrito (pagar primero) ---------- */
      if (cart?.customer?.phone) {
        const r = await getRestrictionByPhone(prisma, cart.customer.phone);
        if (r.restricted) {
          return res.status(403).json({ error: 'restricted', code: r.code, reason: r.reason });
        }
      }
      if (!cart) return res.status(400).json({ error: 'Falta orderId/code o cart' });
      if (!Array.isArray(cart.items) || !cart.items.length || !cart.storeId){
        return res.status(400).json({ error: 'cart inválido' });
      }

      const totalCents = Math.round(Number(cart?.totals?.total) * 100);
      if (!Number.isFinite(totalCents) || totalCents <= 0){
        return res.status(400).json({ error: 'total inválido' });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: { name: 'Pedido MyCrushPizza' },
            unit_amount: totalCents
          },
          quantity: 1
        }],
        success_url: `${FRONT_BASE_URL}/venta/result?status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url : `${FRONT_BASE_URL}/venta/result?status=cancel&session_id={CHECKOUT_SESSION_ID}`,
        locale:'es',
        metadata: {
          cart: JSON.stringify({
            storeId: cart.storeId,
            type   : cart.type,
            delivery: cart.delivery,
            channel: cart.channel || 'WEB',
            customer: cart.customer || null,
            items: cart.items,
            extras: cart.extras || [],
            coupon: cart.coupon || null,
            totals: cart.totals || null
          })
        }
      });

      logI('→ Stripe session creada (modo cart)', { id:session.id });
      return res.json({ url: session.url });

    } catch (e) {
      logE('[POST /api/venta/checkout-session] error', e);
      res.status(400).json({ error:e.message });
    }
});
router.post('/checkout/confirm', async (req, res) => {
    if (!stripeReady) return res.status(503).json({ error: 'Stripe no configurado' });

    try {
      const { sessionId, orderCode } = req.body || {};
      if (!sessionId && !orderCode) {
        return res.status(400).json({ error: 'sessionId u orderCode requerido' });
      }

      // Recuperar sesión
      let session = null;
      if (sessionId) {
        session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
      }

      // Venta
      let sale = null;
      if (session?.metadata?.saleId) {
        sale = await prisma.sale.findUnique({ where: { id: Number(session.metadata.saleId) } });
      }
      if (!sale && session?.id) {
        sale = await prisma.sale.findFirst({ where: { stripeCheckoutSessionId: session.id } });
      }
      if (!sale && orderCode) {
        sale = await prisma.sale.findUnique({ where: { code: String(orderCode) } });
      }

      // ¿Está pagado?
      const payStatus = session?.payment_status || null; // 'paid' | 'no_payment_required' | ...
      let pi = null;
      let stripePiId = null;
      if (session?.payment_intent) {
        if (typeof session.payment_intent === 'string') {
          stripePiId = session.payment_intent;
          pi = await stripe.paymentIntents.retrieve(session.payment_intent);
        } else {
          pi = session.payment_intent;
          stripePiId = pi?.id ?? null;
        }
      }
      const paidBySession = payStatus === 'paid' || payStatus === 'no_payment_required';
      const paidByPI = pi?.status === 'succeeded';
      const isPaid = paidBySession || paidByPI;

      // Carrito: crear venta si pagado (sin canje; lo hará el webhook si llega)
      if (!sale && session?.metadata?.cart) {
        if (!isPaid) return res.json({ ok: true, paid: false, status: 'AWAITING_PAYMENT' });
        // Idempotencia: si ya existe, devolver su estado
        const already = await prisma.sale.findFirst({ where: { stripeCheckoutSessionId: session.id } });
        if (already) {
          return res.json({ ok: true, paid: already.status === 'PAID', status: already.status });
        }
        // Por simplicidad, delegamos completamente en el webhook para crear ventas en modo cart.
        return res.json({ ok: true, paid: true, status: 'PAID' });
      }

      // Venta previa: si no pagó, informar; si pagó, marcar PAID (idempotente)
      if (!sale) return res.status(404).json({ error: 'Pedido no existe' });
      if (!isPaid) return res.json({ ok: true, paid: false, status: sale.status });

      await prisma.$transaction(async (tx) => {
        const fresh = await tx.sale.findUnique({ where: { id: sale.id } });
        if (fresh.status === 'PAID') return; // idempotente

        const items = Array.isArray(fresh.products) ? fresh.products : JSON.parse(fresh.products || '[]');
        for (const p of items) {
          await tx.storePizzaStock.update({
            where: { storeId_pizzaId: { storeId: fresh.storeId, pizzaId: Number(p.pizzaId) } },
            data : { stock: { decrement: Number(p.qty) } }
          });
        }

        const stripePiIdUpdate = stripePiId || fresh.stripePaymentIntentId || null;

        await tx.sale.update({
          where: { id: fresh.id },
          data : {
            status: 'PAID',
            stripePaymentIntentId: stripePiIdUpdate
          }
        });
      });

      res.json({ ok: true, paid: true, status: 'PAID' });
    } catch (e) {
      logE('[POST /api/venta/checkout/confirm] error', e);
      res.status(400).json({ error: e.message });
    }
});
router.post(
    '/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      if (!stripeReady) {
        logW('webhook recibido pero Stripe no está listo');
        return res.status(503).send('Stripe not configured');
      }

      let event;
      try {
        const sig = req.headers['stripe-signature'];
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        logE('⚠️  Webhook signature verification failed.', err);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      logI('Webhook recibido', { type: event.type });

      if (event.type === 'checkout.session.completed') {
        const session        = event.data.object;
        const checkoutId     = session.id;
        const paymentIntent  = session.payment_intent || null;
        const payStatus      = session.payment_status; // 'paid' | 'no_payment_required' | ...
        const payOk          = payStatus === 'paid' || payStatus === 'no_payment_required';

        logI('session.completed', { checkoutId, payStatus, paymentIntent });

        let paidNotify = null;

        try {
          /* ---------- C1) Modo carrito: (opcional) crear venta aquí ---------- */
          if (session.metadata?.cart) {
            let cart = null;
            try { cart = JSON.parse(session.metadata.cart); } catch {}

            if (cart) {
              await prisma.$transaction(async (tx) => {
                const normItems = await normalizeItems(tx, cart.items || []);
                await assertStock(tx, Number(cart.storeId), normItems);
                const { lineItems, totalProducts } =
                  await recalcTotals(tx, Number(cart.storeId), normItems);

                // Cliente
                let customerId = null, snapshot = null;
                const isDelivery =
                  String(cart.type).toUpperCase() === 'DELIVERY' ||
                  String(cart.delivery).toUpperCase() === 'COURIER';

                if (cart?.customer?.phone?.trim()) {
                  const phone = onlyDigits(cart.customer.phone);
                  const name  = (cart.customer.name || '').trim();

                  const createAddress = isDelivery
                    ? (cart.customer.address_1 || 'SIN DIRECCIÓN')
                    : `(PICKUP) ${phone}`;

                  const c = await tx.customer.upsert({
                    where:  { phone },
                    update: {
                      phone, name,
                      ...(isDelivery && {
                        address_1: cart.customer.address_1 || 'SIN DIRECCIÓN',
                        lat: clean(cart.customer.lat),
                        lng: clean(cart.customer.lng),
                      }),
                      portal: clean(cart.customer.portal),
                      observations: clean(cart.customer.observations),
                    },
                    create: {
                      code: await genCustomerCode(tx),
                      phone, name,
                      address_1: createAddress,
                      portal: clean(cart.customer.portal),
                      observations: clean(cart.customer.observations),
                      lat: isDelivery ? clean(cart.customer.lat) : null,
                      lng: isDelivery ? clean(cart.customer.lng) : null,
                    },
                  });

                  customerId = c.id;
                  snapshot = {
                    phone: c.phone, name: c.name,
                    address_1: c.address_1, portal: c.portal, observations: c.observations,
                    lat: c.lat, lng: c.lng
                  };
                }

                // Extras + cupón (preview)
                const extrasFinal = Array.isArray(cart.extras) ? [...cart.extras] : [];
                let discounts = 0;

                const couponCode = upper(cart.coupon || '');
                let percentApplied = null;
                let amountApplied  = null;
                if (couponCode) {
                  const coup = await tx.coupon.findUnique({ where: { code: couponCode } });
                  const nowRef = nowInTZ();
                  const valid =
                    !!coup &&
                    coup.status === 'ACTIVE' &&
                    (coup.usageLimit ?? 1) > (coup.usedCount ?? 0) &&
                    isActiveByDate(coup, nowRef) &&
                    isWithinWindow(coup, nowRef);

                  if (valid) {
                    const comp = computeCouponDiscount({ ...coup, code: couponCode }, totalProducts);
                    if (comp.discount > 0) {
                      discounts = comp.discount;
                      percentApplied = comp.percentApplied;
                      amountApplied  = comp.amountApplied;
                      extrasFinal.push({ code:'COUPON', label:comp.label, amount:-comp.discount, couponCode, percentApplied, amountApplied });
                    }
                  }
                }

                const sale = await tx.sale.create({
                  data: {
                    code: await genOrderCode(tx),
                    storeId: Number(cart.storeId),
                    customerId,
                    type: cart.type || 'LOCAL',
                    delivery: cart.delivery || 'PICKUP',
                    customerData: snapshot || cart.customer || {},
                    products: lineItems,
                    totalProducts,
                    discounts,
                    total:
                      round2(totalProducts - discounts) +
                      (Array.isArray(extrasFinal)
                        ? extrasFinal.reduce((s, e) => s + (Number(e.amount) || 0), 0)
                        : 0),
                    extras: extrasFinal,
                    notes: cart.notes || '',
                    channel: cart.channel || 'WEB',
                    status: payOk ? 'PAID' : 'AWAITING_PAYMENT',
                    stripeCheckoutSessionId: checkoutId,
                    stripePaymentIntentId: paymentIntent ? String(paymentIntent) : null,
                    address_1: snapshot?.address_1 ?? cart?.customer?.address_1 ?? null,
                    lat:       snapshot?.lat       ?? cart?.customer?.lat       ?? null,
                    lng:       snapshot?.lng       ?? cart?.customer?.lng       ?? null,
                  }
                });

                // Bajar stock solo si pago OK
                if (payOk) {
                  for (const p of lineItems) {
                    await tx.storePizzaStock.update({
                      where: { storeId_pizzaId: { storeId: sale.storeId, pizzaId: Number(p.pizzaId) } },
                      data:  { stock: { decrement: Number(p.qty) } }
                    });
                  }
                }

                // Preparar SMS si pago OK
                if (payOk) {
                  const store = await tx.store.findUnique({
                    where: { id: sale.storeId },
                    select: { storeName: true }
                  });
                  paidNotify = {
                    phone: (snapshot?.phone || cart?.customer?.phone || '').trim(),
                    name : (snapshot?.name  || cart?.customer?.name  || '').trim(),
                    code : sale.code,
                    storeName: store?.storeName || 'myCrushPizza',
                    isDelivery:
                      String(sale.delivery).toUpperCase() === 'COURIER' ||
                      String(sale.type).toUpperCase() === 'DELIVERY'
                  };
                }

                // CANJE del cupón (único punto): incremento atómico + log
                if (payOk) {
                  const couponLine = (Array.isArray(extrasFinal) ? extrasFinal : []).find(e => String(e?.code || '').toUpperCase()==='COUPON' && e.couponCode);
                  if (couponLine?.couponCode) {
                    await redeemCouponAtomic(tx, {
                      code: couponLine.couponCode,
                      saleId: sale.id,
                      storeId: sale.storeId,
                      customerId,
                      segmentAtRedeem: null,              // opcional si tienes segmentación
                      kindSnapshot: null, variantSnapshot: null, // se obtendrán del cupón
                      percentApplied: couponLine.percentApplied ?? null,
                      amountApplied : couponLine.amountApplied  ?? null,
                      discountValue : Math.abs(Number(couponLine.amount || 0)) || Number(discounts) || null
                    });
                  }
                }

                logI('Venta creada desde webhook (cart)', {
                  saleId: sale.id, code: sale.code, payStatus
                });
              });

              // Enviar SMS fuera de la transacción
              if (payOk && paidNotify?.phone) {
                const body = buildPaidMsg(paidNotify);
                sendSMS(paidNotify.phone, body).catch(err =>
                  console.error('[Twilio SMS error PAID(cart)]', { err: err.message, code: paidNotify.code })
                );
              }

              return res.json({ received: true });
            }
          }

          /* ---------- C2) Venta previa: marcar pagada + canje ---------- */
          await prisma.$transaction(async (tx) => {
            let sale = await tx.sale.findFirst({
              where: { stripeCheckoutSessionId: checkoutId },
              select: {
                id: true, code: true, type: true, delivery: true, status: true,
                storeId: true, products: true, customerId: true, customerData: true,
                extras: true, discounts: true,
                store: { select: { storeName: true } }
              }
            });

            if (!sale && session.client_reference_id) {
              sale = await tx.sale.findFirst({
                where: { code: session.client_reference_id },
                select: {
                  id: true, code: true, type: true, delivery: true, status: true,
                  storeId: true, products: true, customerId: true, customerData: true,
                  extras: true, discounts: true,
                  store: { select: { storeName: true } }
                }
              });
            }

            if (!sale) { logW('Webhook session sin venta asociada', { checkoutId }); return; }
            if (sale.status === 'PAID') { logI('Webhook idempotente (ya pagado)', { saleId: sale.id }); return; }

            // Bajar stock solo si pago OK
            if (payOk) {
              const items = Array.isArray(sale.products)
                ? sale.products
                : JSON.parse(sale.products || '[]');
              for (const p of items) {
                await tx.storePizzaStock.update({
                  where: { storeId_pizzaId: { storeId: sale.storeId, pizzaId: Number(p.pizzaId) } },
                  data:  { stock: { decrement: Number(p.qty) } }
                });
              }
            }

            await tx.sale.update({
              where: { id: sale.id },
              data: {
                status: payOk ? 'PAID' : 'AWAITING_PAYMENT',
                paidAt: payOk ? new Date() : null,
                stripePaymentIntentId: paymentIntent ? String(paymentIntent) : null,
                processed: false
              }
            });

            if (payOk) {
              paidNotify = {
                phone: (sale.customerData?.phone || '').trim(),
                name : (sale.customerData?.name  || '').trim(),
                code : sale.code,
                storeName: sale.store?.storeName || 'myCrushPizza',
                isDelivery:
                  String(sale.delivery).toUpperCase() === 'COURIER' ||
                  String(sale.type || '').toUpperCase() === 'DELIVERY' ||
                  sale.delivery === true || sale.delivery === 1 || sale.delivery === '1'
              };

              // CANJE cupón si existe
              const extrasArr = Array.isArray(sale.extras) ? sale.extras : parseMaybe(sale.extras, []);
              const couponLine = (Array.isArray(extrasArr) ? extrasArr : []).find(e => String(e?.code || '').toUpperCase()==='COUPON' && e.couponCode);
              if (couponLine?.couponCode) {
                await redeemCouponAtomic(tx, {
                  code: couponLine.couponCode,
                  saleId: sale.id,
                  storeId: sale.storeId,
                  customerId: sale.customerId || null,
                  segmentAtRedeem: null,
                  kindSnapshot: null, variantSnapshot: null,
                  percentApplied: couponLine.percentApplied ?? null,
                  amountApplied : couponLine.amountApplied  ?? null,
                  discountValue : Math.abs(Number(couponLine.amount || 0)) || Number(sale.discounts || 0) || null
                });
              }
            }

            logI('Venta actualizada por webhook', { saleId: sale.id, payStatus });
          });

          if (payOk && paidNotify?.phone) {
            const body = buildPaidMsg(paidNotify);
            sendSMS(paidNotify.phone, body).catch(err =>
              console.error('[Twilio SMS error PAID(update)]', { err: err.message, code: paidNotify.code })
            );
          }

        } catch (e) {
          logE('[webhook] error al procesar session.completed', e);
        }
      }

      return res.json({ received: true });
    }
);
router.get('/status/:code', async (req, res) => {
    try {
      const sale = await prisma.sale.findUnique({ where:{ code:req.params.code }, select:{ status:true, processed:true, deliveredAt:true } });
      if (!sale) return res.status(404).json({ error:'not found' });
      res.json(sale);
    } catch (e) { logE('[GET /status/:code] error', e); res.status(400).json({ error:'bad request' }); }
});
router.get('/_health', (req, res) => {
    res.json({ ok:true, stripeReady, frontBaseUrl: FRONT_BASE_URL });
});

  return router;
};

/* ========= Helper interno: canje atómico + log ========= */
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

  // Validación rápida (idéntico a /coupons/redeem)
  if (row.status === 'DISABLED') return;
  if (!isActiveByDate(row, nowRef)) return;
  if (!isWithinWindow(row, nowRef)) return;
  if ((row.usageLimit ?? 1) <= (row.usedCount ?? 0)) return;

  // Incremento atómico si aún quedan usos
  const inc = await tx.coupon.updateMany({
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

  if (inc.count === 0) return; // carrera perdida/idempotente

  const after = await tx.coupon.findUnique({ where: { code } });
  if ((after.usedCount ?? 0) >= (after.usageLimit ?? 1) && after.status !== 'USED') {
    await tx.coupon.update({ where: { code }, data: { status: 'USED' } });
  }

  // Log de redención
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
