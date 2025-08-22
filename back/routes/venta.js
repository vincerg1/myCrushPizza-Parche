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
const round2 = n => Math.round(Number(n) * 100) / 100;

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
    theKey: {
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

  /* ============================================================
   *  A) CREA LA VENTA (AWAITING_PAYMENT)  →  Checkout
   * ============================================================ */
  router.post('/pedido', async (req, res) => {
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

        // [COUPON] Extras + cupón (marca como usado YA; si prefieres tras pago, muévelo al webhook)
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
            extrasFinal.push({ code: 'COUPON', label: `Cupón ${couponCode} (-${percent}%)`, amount: -discounts });
            await tx.coupon.update({ where: { id: coup.id }, data : { used: true, usedAt: new Date() } });
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
            discounts,
            total: round2(totalProducts - discounts),
            extras: extrasFinal,
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

  /* ============================================================
   *  B) CHECKOUT SESSION
   *     - Con venta previa (orderId/code)  → flujo clásico
   *     - O con carrito "cart"             → pagar primero
   * ============================================================ */
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

        const productsJson = Array.isArray(sale.products) ? sale.products : JSON.parse(sale.products || '[]');
        const extrasJson   = Array.isArray(sale.extras)   ? sale.extras   : JSON.parse(sale.extras   || '[]');

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

          // prorrateo de descuento
          const totalProductsOriginal = Number(total);
          const discountAmount = Number(sale.discounts || 0);
          const discountFraction = (totalProductsOriginal > 0 && discountAmount > 0)
            ? (discountAmount / totalProductsOriginal)
            : 0;

          const productLines = lineItems.map(li => {
            const qty = Number(li.qty || 1);
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

          // envío desde extras (DELIVERY_FEE) o cálculo blocks
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
            success_url: `${FRONT_BASE_URL}/venta/result?status=success&order=${encodeURIComponent(sale.code)}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url : `${FRONT_BASE_URL}/venta/result?status=cancel&order=${encodeURIComponent(sale.code)}&session_id={CHECKOUT_SESSION_ID}`,
            metadata: { saleId:String(sale.id), saleCode:sale.code||'', type:sale.type, delivery:sale.delivery }
          });

          // total final
          const netProductsTotal = round2(totalProductsOriginal - discountAmount);
          const totalWithShipping = netProductsTotal + (shippingAmountCents/100);

          await tx.sale.update({
            where:{ id:sale.id },
            data : { total: totalWithShipping, stripeCheckoutSessionId: session.id, status:'AWAITING_PAYMENT' }
          });

          logI('→ Stripe session creada (venta previa)', { id:session.id, saleId:sale.id });
          res.json({ url: session.url });
        });

        return;
      }

      /* ---------- B2) Modo carrito (pagar primero) ---------- */
      if (!cart) return res.status(400).json({ error: 'Falta orderId/code o cart' });
      if (!Array.isArray(cart.items) || !cart.items.length || !cart.storeId){
        return res.status(400).json({ error: 'cart inválido' });
      }

      const totalCents = Math.round(Number(cart?.totals?.total) * 100);
      if (!Number.isFinite(totalCents) || totalCents <= 0){
        return res.status(400).json({ error: 'total inválido' });
      }

      // ⚠️ En producción, mejor guardar el carrito en BD y pasar un token.
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: "eur",
            product_data: { name: "Pedido MyCrushPizza" },
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
            items: cart.items,            // [{pizzaId,size,qty}]
            extras: cart.extras || [],    // p.ej. DELIVERY_FEE
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

  /* ============================================================
   *  B.1) Confirmación manual (doble seguro)
   *       Verifica session y marca PAID / crea venta (modo cart)
   * ============================================================ */
  router.post('/checkout/confirm', async (req, res) => {
    if (!stripeReady) return res.status(503).json({ error: 'Stripe no configurado' });

    try {
      const { sessionId, orderCode } = req.body || {};
      if (!sessionId && !orderCode) {
        return res.status(400).json({ error: 'sessionId u orderCode requerido' });
      }

      // Recuperar sesión (si tenemos sessionId)
      let session = null;
      if (sessionId) {
        session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
      }

      // Intentar localizar la venta existente
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
      const paidBySession = session?.payment_status === 'paid';
      let pi = null;
      if (session?.payment_intent) {
        pi = typeof session.payment_intent === 'string'
          ? await stripe.paymentIntents.retrieve(session.payment_intent)
          : session.payment_intent;
      }
      const paidByPI = pi?.status === 'succeeded';
      const isPaid = paidBySession || paidByPI;

      // Modo carrito: no hay venta aún, pero existe cart en metadata → crear ahora
      if (!sale && session?.metadata?.cart) {
        let cart = null;
        try { cart = JSON.parse(session.metadata.cart); } catch {}
        if (!cart) return res.status(404).json({ error: 'No hay venta ni carrito asociado a la sesión' });
        if (!isPaid) return res.json({ ok:true, paid:false, status:'AWAITING_PAYMENT' });

        // Idempotencia por checkoutId
        const already = await prisma.sale.findFirst({ where:{ stripeCheckoutSessionId: session.id } });
        if (already) {
          return res.json({ ok:true, paid: already.status === 'PAID', status: already.status });
        }

        await prisma.$transaction(async (tx) => {
          const normItems = await normalizeItems(tx, cart.items || []);
          await assertStock(tx, Number(cart.storeId), normItems);
          const { lineItems, totalProducts } = await recalcTotals(tx, Number(cart.storeId), normItems);

          // Cliente
          let customerId = null, snapshot = null;
          const isDelivery =
            String(cart.type).toUpperCase() === 'DELIVERY' ||
            String(cart.delivery).toUpperCase() === 'COURIER';

          if (cart?.customer?.phone?.trim()){
            const phone = onlyDigits(cart.customer.phone);
            const name  = (cart.customer.name || '').trim();
            const createAddress = isDelivery ? (cart.customer.address_1 || 'SIN DIRECCIÓN') : `(PICKUP) ${phone}`;

            const c = await tx.customer.upsert({
              where: { phone },
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

          // Extras + cupón (marcar usado aquí)
          const extrasFinal = Array.isArray(cart.extras) ? [...cart.extras] : [];
          let discounts = 0;

          const couponCode = upper(cart.coupon || '');
          if (couponCode){
            const coup = await tx.coupon.findUnique({ where: { code: couponCode } });
            const expired = !!(coup?.expiresAt && coup.expiresAt < new Date());
            if (coup && !coup.used && !expired){
              const percent = Number(coup.percent) || 0;
              if (percent > 0){
                const discountAmount = round2(totalProducts * (percent/100));
                discounts = discountAmount;
                extrasFinal.push({ code:'COUPON', label:`Cupón ${couponCode} (-${percent}%)`, amount:-discounts });
                await tx.coupon.update({ where: { id:coup.id }, data : { used:true, usedAt:new Date() } });
              }
            }
          }

          const newSale = await tx.sale.create({
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
              total: round2(totalProducts - discounts) + (Array.isArray(extrasFinal) ? extrasFinal.reduce((s,e)=>s + (Number(e.amount)||0), 0) : 0),
              extras: extrasFinal,
              notes: cart.notes || '',
              channel: cart.channel || 'WEB',
              status: 'PAID',
              stripeCheckoutSessionId: session.id,
              stripePaymentIntentId: String(pi?.id || session.payment_intent || ''),
              address_1: snapshot?.address_1 ?? cart?.customer?.address_1 ?? null,
              lat: snapshot?.lat ?? cart?.customer?.lat ?? null,
              lng: snapshot?.lng ?? cart?.customer?.lng ?? null,
            }
          });

          // Bajar stock
          for (const p of lineItems){
            await tx.storePizzaStock.update({
              where:{ storeId_pizzaId:{ storeId:newSale.storeId, pizzaId:Number(p.pizzaId) } },
              data :{ stock:{ decrement:Number(p.qty) } }
            });
          }
        });

        return res.json({ ok:true, paid:true, status:'PAID' });
      }

      // Venta previa: si no pagó, informar; si pagó, marcar PAID (idempotente)
      if (!sale) return res.status(404).json({ error: 'Pedido no existe' });
      if (!isPaid) return res.json({ ok:true, paid:false, status:sale.status });

      await prisma.$transaction(async (tx) => {
        const fresh = await tx.sale.findUnique({ where:{ id:sale.id } });
        if (fresh.status === 'PAID') return; // idempotente

        const items = Array.isArray(fresh.products) ? fresh.products : JSON.parse(fresh.products || '[]');
        for (const p of items){
          await tx.storePizzaStock.update({
            where:{ storeId_pizzaId:{ storeId:fresh.storeId, pizzaId:Number(p.pizzaId) } },
            data :{ stock:{ decrement:Number(p.qty) } }
          });
        }

        await tx.sale.update({
          where:{ id:fresh.id },
          data :{
            status:'PAID',
            stripePaymentIntentId: String(pi?.id || session?.payment_intent || fresh.stripePaymentIntentId || ''),
          }
        });
      });

      res.json({ ok:true, paid:true, status:'PAID' });
    } catch (e) {
      logE('[POST /api/venta/checkout/confirm] error', e);
      res.status(400).json({ error: e.message });
    }
  });

  /* ============================================================
   *  C) Webhook Stripe
   *     - Si viene saleId: marcar pagada + bajar stock
   *     - Si viene cart  : crear venta ahora, bajar stock, marcar cupón
   * ============================================================ */
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
        /* ---------- C1) Modo carrito: crear venta ahora ---------- */
        if (session.metadata?.cart){
          let cart = null;
          try { cart = JSON.parse(session.metadata.cart); } catch {}
          if (cart){
            await prisma.$transaction(async (tx) => {
              // Normalizar items y recalcular precios
              const normItems = await normalizeItems(tx, cart.items || []);
              await assertStock(tx, Number(cart.storeId), normItems);
              const { lineItems, totalProducts } = await recalcTotals(tx, Number(cart.storeId), normItems);

              // Cliente (si hay teléfono)
              let customerId = null, snapshot = null;
              const isDelivery =
                String(cart.type).toUpperCase() === 'DELIVERY' ||
                String(cart.delivery).toUpperCase() === 'COURIER';

              if (cart?.customer?.phone?.trim()){
                const phone = onlyDigits(cart.customer.phone);
                const name  = (cart.customer.name || '').trim();

                const createAddress = isDelivery
                  ? (cart.customer.address_1 || 'SIN DIRECCIÓN')
                  : `(PICKUP) ${phone}`;

                const c = await tx.customer.upsert({
                  where: { phone },
                  update: {
                    phone,
                    name,
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
                    phone,
                    name,
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

              // Extras + cupón (marcar usado AHORA)
              const extrasFinal = Array.isArray(cart.extras) ? [...cart.extras] : [];
              let discounts = 0;

              const couponCode = upper(cart.coupon || '');
              if (couponCode){
                const coup = await tx.coupon.findUnique({ where: { code: couponCode } });
                const expired = !!(coup?.expiresAt && coup.expiresAt < new Date());
                if (coup && !coup.used && !expired){
                  const percent = Number(coup.percent) || 0;
                  if (percent > 0){
                    const discountAmount = round2(totalProducts * (percent/100));
                    discounts = discountAmount;
                    extrasFinal.push({ code:'COUPON', label:`Cupón ${couponCode} (-${percent}%)`, amount:-discounts });
                    await tx.coupon.update({
                      where: { id:coup.id },
                      data : { used:true, usedAt:new Date() }
                    });
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
                  total: round2(totalProducts - discounts) + (Array.isArray(extrasFinal) ? extrasFinal.reduce((s,e)=>s + (Number(e.amount)||0), 0) : 0),
                  extras: extrasFinal,
                  notes: cart.notes || '',
                  channel: cart.channel || 'WEB',
                  status: 'PAID',
                  stripeCheckoutSessionId: checkoutId,
                  stripePaymentIntentId: String(paymentIntent),
                  address_1: snapshot?.address_1 ?? cart?.customer?.address_1 ?? null,
                  lat: snapshot?.lat ?? cart?.customer?.lat ?? null,
                  lng: snapshot?.lng ?? cart?.customer?.lng ?? null,
                }
              });

              // Bajar stock
              for (const p of lineItems){
                await tx.storePizzaStock.update({
                  where:{ storeId_pizzaId:{ storeId:sale.storeId, pizzaId:Number(p.pizzaId) } },
                  data :{ stock:{ decrement:Number(p.qty) } }
                });
              }

              logI('Venta creada desde webhook (cart)', { saleId:sale.id, code:sale.code });
            });

            return res.json({ received:true });
          }
        }

        /* ---------- C2) Venta previa: marcar pagada y bajar stock ---------- */
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

      } catch (e) {
        logE('[webhook] error al procesar session.completed', e);
      }
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
