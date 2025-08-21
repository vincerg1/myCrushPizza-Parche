// routes/venta.js
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

/* ───────── helpers ───────── */
const ts  = () => new Date().toISOString();
const logI = (m, x={}) => console.info(`[venta][${ts()}] ${m}`, x);
const logW = (m, x={}) => console.warn(`[venta][${ts()}] ${m}`, x);
const logE = (m, e)     => console.error(`[venta][${ts()}] ${m}`, e?.message || e);

const FRONT_BASE_URL = process.env.FRONT_BASE_URL || 'http://localhost:3000';

const onlyDigits = s => (s || '').replace(/\D/g, '');
const clean = v => (v === undefined || v === '' ? null : v);
const upper = s => String(s || '').trim().toUpperCase();
const toPrice = v => { if (v==null||v==='') return NaN; const n=Number(String(v).replace(',','.')); return Number.isFinite(n)?n:NaN; };
const parseMaybe = (v, fb = {}) => { try { return v==null?fb : (typeof v==='string' ? JSON.parse(v) : v); } catch { return fb; } };
const round2 = n => Math.round(Number(n) * 100) / 100; // ← redondeo a 2 decimales

const DELIVERY_MAX_KM = Number(process.env.DELIVERY_MAX_KM ?? 7);
function haversineKm(lat1, lon1, lat2, lon2){
  const R=6371,toRad=d=>(d*Math.PI)/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

/* ───────── generadores ───────── */
async function genOrderCode(db){ let code; do{ code='ORD-'+Math.floor(10000+Math.random()*90000);} while(await db.sale.findUnique({where:{code}})); return code; }
async function genCustomerCode(db){ let code; do{ code='CUS-'+Math.floor(10000+Math.random()*90000);} while(await db.customer.findUnique({where:{code}})); return code; }

/* ───────── items: normalización/stock/total ───────── */
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

/* ───────────────────────────────────────────────────────────── */
module.exports = (prisma) => {

  // POST /api/venta/pedido
  router.post('/pedido', async (req, res) => {
    const {
      storeId,
      type = 'DELIVERY',
      delivery = 'COURIER',
      customer,
      items = [],
      extras = [],                       // ← [COUPON] ahora aceptamos extras (p.ej. DELIVERY_FEE)
      notes = '',
      channel = 'WHATSAPP',
      coupon: rawCoupon,                 // ← [COUPON] también aceptamos 'coupon'
      couponCode: rawCouponCode          // ← [COUPON] o 'couponCode'
    } = req.body || {};
    logI('POST /pedido ←', { storeId, items: items?.length || 0, channel, type, delivery, coupon: rawCoupon || rawCouponCode });

    try {
      if (!storeId) return res.status(400).json({ error: 'storeId requerido' });

      // Cobertura (solo delivery)
      if (String(delivery).toUpperCase() === 'COURIER'){
        const lat = Number(customer?.lat), lng = Number(customer?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)){
          return res.status(400).json({ error:'Faltan coordenadas del cliente (lat/lng) para calcular cobertura.' });
        }
        const activeStores = await prisma.store.findMany({
          where: { active:true, latitude:{ not:null }, longitude:{ not:null } },
          select:{ id:true, latitude:true, longitude:true }
        });
        if (!activeStores.length) return res.status(400).json({ error:'No hay tiendas activas configuradas con ubicación.' });

        let nearest = { id:null, km:Infinity };
        for (const s of activeStores){
          const km = haversineKm(lat, lng, Number(s.latitude), Number(s.longitude));
          if (km < nearest.km) nearest = { id:s.id, km };
        }
        if (!nearest || nearest.km > DELIVERY_MAX_KM){
          logW('Pedido fuera de cobertura', { lat, lng, nearestKm:Number(nearest?.km?.toFixed?.(2) ?? 'NaN'), limitKm:DELIVERY_MAX_KM, nearestStoreId:nearest?.id || null });
          return res.status(400).json({ error:`Esta dirección está fuera de la zona de servicio (máx ${DELIVERY_MAX_KM} km).` });
        }
      }

      // Cliente
      let customerId = null, snapshot = null;
      const isDelivery =
        String(type).toUpperCase() === 'DELIVERY' ||
        String(delivery).toUpperCase() === 'COURIER';

      if (customer?.phone?.trim()){
        const phone = onlyDigits(customer.phone);
        const name  = (customer.name || '').trim();

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

      // Ítems
      const normItems = await normalizeItems(prisma, items);

      const created = await prisma.$transaction(async (tx) => {
        await assertStock(tx, Number(storeId), normItems);
        const { lineItems, totalProducts } = await recalcTotals(tx, Number(storeId), normItems);

        // [COUPON] preparar extras (clonados) y aplicar cupón si procede
        const extrasFinal = Array.isArray(extras) ? [...extras] : [];
        let discounts = 0;

        const couponCode = upper(rawCoupon || rawCouponCode || '');
        if (couponCode) {
          const coup = await tx.coupon.findUnique({ where: { code: couponCode } });
          const expired = !!(coup?.expiresAt && coup.expiresAt < new Date());
          if (!coup || coup.used || expired) {
            throw new Error('Cupón inválido o ya usado/expirado');
          }
          const percent = Number(coup.percent) || 0;
          if (percent > 0) {
            const discountAmount = round2(totalProducts * (percent/100));
            discounts = discountAmount;

            // Añadimos un extra negativo para rastrear el cupón en la venta
            extrasFinal.push({
              code: 'COUPON',
              label: `Cupón ${couponCode} (-${percent}%)`,
              amount: -discounts
            });

            // Marcar cupón como usado YA (si prefieres tras pago, mueve esto al webhook)
            await tx.coupon.update({
              where: { id: coup.id },
              data : { used: true, usedAt: new Date() }
            });
          }
        }

        const sale = await tx.sale.create({
          data: {
            code: await genOrderCode(tx),
            storeId: Number(storeId),
            customerId,
            type,
            delivery,
            customerData: snapshot,
            products: lineItems,
            totalProducts,
            discounts,                         // [COUPON] monto de descuento aplicado sobre productos
            total: round2(totalProducts - discounts), // [COUPON] total neto de productos (sin envío)
            extras: extrasFinal,               // [COUPON] guardamos extras (incluye fee y cupón)
            notes,
            channel,
            status: 'AWAITING_PAYMENT',
            address_1: snapshot?.address_1 ?? null,
            lat: snapshot?.lat ?? null,
            lng: snapshot?.lng ?? null,
          },
          select: { id:true, code:true, total:true, currency:true, discounts:true },
        });
        return sale;
      });

      logI('→ pedido creado', created);
      res.json(created);
    } catch (e) {
      logE('[POST /api/venta/pedido] error', e);
      res.status(400).json({ error: e.message });
    }
  });

  // POST /api/venta/checkout-session
  router.post('/checkout-session', async (req, res) => {
    if (!stripeReady){
      logW('checkout-session llamado sin Stripe listo');
      return res.status(503).json({ error:'Stripe no configurado' });
    }

    try{
      const { orderId, code } = req.body || {};
      const where = orderId ? { id:Number(orderId) } : { code:String(code) };

      const sale = await prisma.sale.findUnique({ where });
      if (!sale)  return res.status(404).json({ error:'Pedido no existe' });
      if (sale.status === 'PAID') return res.status(400).json({ error:'Pedido ya pagado' });

      const productsJson = Array.isArray(sale.products) ? sale.products : JSON.parse(sale.products || '[]');
      const extrasJson   = Array.isArray(sale.extras)   ? sale.extras   : JSON.parse(sale.extras   || '[]');

      await prisma.$transaction(async (tx) => {
        await assertStock(tx, sale.storeId, productsJson);
        const { lineItems, total } = await recalcTotals(tx, sale.storeId, productsJson);

        // resolver nombres por id
        const ids = [...new Set(lineItems.map(li => Number(li.pizzaId)).filter(Boolean))];
        let nameById = new Map();
        if (ids.length){
          const pizzas = await tx.menuPizza.findMany({ where:{ id:{ in: ids } }, select:{ id:true, name:true } });
          nameById = new Map(pizzas.map(p => [p.id, p.name]));
        }

        const currency = String(sale.currency || 'EUR').toLowerCase();

        // [COUPON] aplicamos descuento prorrateando unit_amount
        const totalProductsOriginal = Number(total);
        const discountAmount = Number(sale.discounts || 0);
        const discountFraction = (totalProductsOriginal > 0 && discountAmount > 0)
          ? (discountAmount / totalProductsOriginal)
          : 0;

        const productLines = lineItems.map(li => {
          const qty = Number(li.qty || 1);
          const baseName = `${(li.name || nameById.get(Number(li.pizzaId)) || `#${li.pizzaId}`)}${li.size ? ` (${li.size})` : ''}`;
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

        // [COUPON] shipping solo desde extras con code==='DELIVERY_FEE'
        let shippingAmountCents = 0;
        if (sale.delivery === 'COURIER'){
          const shippingExtras = (Array.isArray(extrasJson)?extrasJson:[])
            .filter(ex => ex && ex.code === 'DELIVERY_FEE' && typeof ex.amount === 'number');

          if (shippingExtras.length){
            shippingAmountCents = Math.round(
              shippingExtras.reduce((s,e)=>s+Number(e.amount||0),0) * 100
            );
          } else {
            const totalQty = lineItems.reduce((s,li)=>s+Number(li.qty||0),0);
            const blocks = Math.ceil(totalQty / 5);
            shippingAmountCents = blocks * 250; // 2.50 €
          }
        }

        const pmTypes = ['card'];
        if (process.env.STRIPE_ENABLE_LINK   === '1') pmTypes.push('link');
        if (process.env.STRIPE_ENABLE_KLARNA === '1') pmTypes.push('klarna');

        const shippingOptions =
          sale.delivery === 'COURIER' && shippingAmountCents > 0
            ? [{
                shipping_rate_data:{
                  display_name:'Gastos de envío',
                  type:'fixed_amount',
                  fixed_amount:{ amount:shippingAmountCents, currency }
                }
              }]
            : undefined;

        logI('Creando Stripe Checkout', { saleId:sale.id, lineItems:productLines.length, shippingCents:shippingAmountCents, currency, pmTypes });

        const session = await stripe.checkout.sessions.create({
          mode:'payment',
          payment_method_types: pmTypes,
          line_items: productLines,
          shipping_address_collection: sale.delivery === 'COURIER' ? { allowed_countries:['ES'] } : undefined,
          shipping_options: shippingOptions,
          phone_number_collection: { enabled:true },
          customer_email: sale.customerData?.email || undefined,
          billing_address_collection: 'auto',
          locale:'es',

          // ⬇⬇⬇ UNIFICADO: siempre vuelve a /venta/result con status y order
          success_url: `${FRONT_BASE_URL}/venta/result?status=success&order=${encodeURIComponent(sale.code)}`,
          cancel_url : `${FRONT_BASE_URL}/venta/result?status=cancel&order=${encodeURIComponent(sale.code)}`,

          metadata: { saleId:String(sale.id), saleCode:sale.code||'', type:sale.type, delivery:sale.delivery }
        });

        // [COUPON] total final = productos con descuento + envío
        const netProductsTotal = round2(totalProductsOriginal - discountAmount);
        const totalWithShipping = netProductsTotal + (shippingAmountCents/100);

        await tx.sale.update({
          where:{ id:sale.id },
          data : { total: totalWithShipping, stripeCheckoutSessionId: session.id, status:'AWAITING_PAYMENT' }
        });

        logI('→ Stripe session creada', { id:session.id });
        res.json({ url: session.url });
      });

    } catch (e) {
      logE('[POST /api/venta/checkout-session] error', e);
      res.status(400).json({ error:e.message });
    }
  });

  // Webhook Stripe
  router.post('/stripe/webhook', express.raw({ type:'application/json' }), async (req, res) => {
    if (!stripeReady) { logW('webhook recibido pero Stripe no está listo'); return res.status(503).send('Stripe not configured'); }
    let event;
    try {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logE('⚠️  Webhook signature verification failed.', err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    logI('Webhook recibido', { type: event.type });

    if (event.type === 'checkout.session.completed'){
      const session = event.data.object;
      const checkoutId = session.id;
      const paymentIntent = session.payment_intent;

      try {
        await prisma.$transaction(async (tx) => {
          const sale = await tx.sale.findFirst({ where:{ stripeCheckoutSessionId: checkoutId } });
          if (!sale){ logW('Webhook session sin venta asociada', { checkoutId }); return; }
          if (sale.status === 'PAID'){ logI('Webhook idempotente (ya pagado)', { saleId:sale.id }); return; }

          const items = Array.isArray(sale.products) ? sale.products : JSON.parse(sale.products || '[]');
          for (const p of items){
            await tx.storePizzaStock.update({
              where:{ storeId_pizzaId:{ storeId:sale.storeId, pizzaId:Number(p.pizzaId) } },
              data :{ stock:{ decrement:Number(p.qty) } }
            });
          }

          await tx.sale.update({
            where:{ id:sale.id },
            data :{ status:'PAID', stripePaymentIntentId:String(paymentIntent), processed:false }
          });

          logI('Venta marcada como PAID', { saleId:sale.id });
        });
      } catch (e) { logE('[webhook] error al actualizar venta', e); }
    }

    res.json({ received:true });
  });

  // Estado rápido por código
  router.get('/status/:code', async (req, res) => {
    try {
      const sale = await prisma.sale.findUnique({ where:{ code:req.params.code }, select:{ status:true, processed:true, deliveredAt:true } });
      if (!sale) return res.status(404).json({ error:'not found' });
      res.json(sale);
    } catch (e) { logE('[GET /status/:code] error', e); res.status(400).json({ error:'bad request' }); }
  });

  // Healthcheck
  router.get('/_health', (req, res) => {
    res.json({ ok:true, stripeReady, frontBaseUrl: FRONT_BASE_URL });
  });

  return router;
};
