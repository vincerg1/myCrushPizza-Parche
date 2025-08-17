// routes/venta.js
'use strict';

const express = require('express');
const router  = express.Router();

/* ───────────── Stripe: carga segura + logs ───────────── */
let StripeSDK = null;
let stripe    = null;
let stripeReady = false;

try {
  StripeSDK = require('stripe');
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('[venta] STRIPE_SECRET_KEY no configurada; endpoints de pago devolverán 503');
  } else {
    stripe = new StripeSDK(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    stripeReady = true;
    console.info('[venta] Stripe SDK cargado ✓');
  }
} catch (e) {
  console.warn('[venta] Paquete "stripe" no instalado. Ejecuta: npm i stripe');
}

/* ───────────── helpers de log ───────────── */
const ts = () => new Date().toISOString();
const logI = (msg, meta = {}) => console.info(`[venta][${ts()}] ${msg}`, meta);
const logW = (msg, meta = {}) => console.warn(`[venta][${ts()}] ${msg}`, meta);
const logE = (msg, err)       => console.error(`[venta][${ts()}] ${msg}`, err?.message || err);
const DELIVERY_MAX_KM = Number(process.env.DELIVERY_MAX_KM ?? 7);

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
/* ───────────── generadores de códigos ───────────── */
async function genOrderCode(db) {
  let code;
  do { code = 'ORD-' + Math.floor(10000 + Math.random() * 90000); }
  while (await db.sale.findUnique({ where: { code } }));
  return code;
}
async function genCustomerCode(db) {
  let code;
  do { code = 'CUS-' + Math.floor(10000 + Math.random() * 90000); }
  while (await db.customer.findUnique({ where: { code } }));
  return code;
}
/* ───────────── recálculo y stock ───────────── */
async function recalcTotals(tx, storeId, items) {
  // items: [{ pizzaId, size, qty }]
  const ids = [...new Set(items.map(i => Number(i.pizzaId)))];
  const pizzas = await tx.menuPizza.findMany({ where: { id: { in: ids } } });

  let totalProducts = 0;
  const normalized = items.map(it => {
    const mp = pizzas.find(p => p.id === Number(it.pizzaId));
    if (!mp) throw new Error(`Pizza ${it.pizzaId} no existe`);
    const sizeKey = String(it.size);
    const priceMap = mp.priceBySize || {};
    const raw = priceMap[sizeKey];
    const price = Number(raw);
    if (!Number.isFinite(price)) throw new Error(`Precio no definido para ${mp.name} (${sizeKey})`);
    const qty = Number(it.qty || 1);
    totalProducts += price * qty;
    return { pizzaId: mp.id, size: sizeKey, qty, price };
  });

  return { lineItems: normalized, totalProducts, total: totalProducts };
}
async function assertStock(tx, storeId, items) {
  for (const it of items) {
    const stk = await tx.storePizzaStock.findUnique({
      where : { storeId_pizzaId: { storeId: Number(storeId), pizzaId: Number(it.pizzaId) } },
      select: { stock: true }
    });
    if (!stk || stk.stock < Number(it.qty)) {
      throw new Error(`Stock insuficiente para pizza ${it.pizzaId}`);
    }
  }
}

module.exports = (prisma) => {

  // ─────────────────────────────────────────────────────────────
  // POST /api/venta/pedido   (público)  → crea venta "AWAITING_PAYMENT"
  // ─────────────────────────────────────────────────────────────
    router.post('/pedido', async (req, res) => {
      const {
        storeId,
        type = 'DELIVERY',
        delivery = 'COURIER',
        customer,
        items = [],
        notes = '',
        channel = 'WHATSAPP',
      } = req.body || {};
      logI('POST /pedido ←', { storeId, items: items?.length || 0, channel });

      try {
        if (!storeId) {
          return res.status(400).json({ error: 'storeId requerido' });
        }
        if (!Array.isArray(items) || !items.length) {
          return res.status(400).json({ error: 'items vacío' });
        }

        /* ---------- Validación de cobertura (solo delivery) ---------- */
        if (delivery === 'COURIER') {
          const lat = Number(customer?.lat);
          const lng = Number(customer?.lng);

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({
              error:
                'Faltan coordenadas del cliente (lat/lng) para calcular cobertura.',
            });
          }

          const DELIVERY_MAX_KM = Number(process.env.DELIVERY_MAX_KM ?? 7);
          const toRad = (d) => (d * Math.PI) / 180;
          const haversineKm = (aLat, aLng, bLat, bLng) => {
            const R = 6371; // km
            const dLat = toRad(bLat - aLat);
            const dLng = toRad(bLng - aLng);
            const a =
              Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(aLat)) *
                Math.cos(toRad(bLat)) *
                Math.sin(dLng / 2) ** 2;
            return 2 * R * Math.asin(Math.sqrt(a));
          };

          // Traer tiendas activas con coordenadas
          const activeStores = await prisma.store.findMany({
            where: {
              active: true,
              latitude: { not: null },
              longitude: { not: null },
            },
            select: { id: true, latitude: true, longitude: true },
          });

          if (!activeStores.length) {
            return res
              .status(400)
              .json({ error: 'No hay tiendas activas configuradas con ubicación.' });
          }

          // Distancia mínima a cualquier tienda activa
          let nearest = { id: null, km: Infinity };
          for (const s of activeStores) {
            const km = haversineKm(
              lat,
              lng,
              Number(s.latitude),
              Number(s.longitude)
            );
            if (km < nearest.km) nearest = { id: s.id, km };
          }

          if (!nearest || nearest.km > DELIVERY_MAX_KM) {
            logW('Pedido fuera de cobertura', {
              lat,
              lng,
              nearestKm: Number(nearest?.km?.toFixed?.(2) ?? 'NaN'),
              limitKm: DELIVERY_MAX_KM,
              nearestStoreId: nearest?.id || null,
            });
            return res.status(400).json({
              error: `Esta dirección está fuera de la zona de servicio (máx ${DELIVERY_MAX_KM} km).`,
            });
          }

          // Si quisieras forzar la tienda más cercana, descomenta la línea:
          // req.body.storeId = nearest.id;
        }
        /* ------------------------------------------------------------- */

        // upsert cliente por teléfono (opcional)
        let customerId = null;
        let snapshot = null;
        if (customer?.phone?.trim()) {
          const data = (({
            phone,
            name,
            address_1,
            portal,
            observations,
            lat,
            lng,
          }) => ({ phone, name, address_1, portal, observations, lat, lng }))(customer);

          const c = await prisma.customer.upsert({
            where: { phone: data.phone },
            update: data,
            create: { code: await genCustomerCode(prisma), ...data },
          });
          customerId = c.id;
          snapshot = data;
        }

        const created = await prisma.$transaction(async (tx) => {
          // recálculo y comprobación de stock (no decrementamos aún)
          await assertStock(tx, Number(storeId), items);
          const { lineItems, totalProducts, total } = await recalcTotals(
            tx,
            Number(storeId),
            items
          );

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
              discounts: 0,
              total,
              notes,
              channel,
              status: 'AWAITING_PAYMENT',
              address_1: snapshot?.address_1 ?? null,
              lat: snapshot?.lat ?? null,
              lng: snapshot?.lng ?? null,
            },
            select: { id: true, code: true, total: true, currency: true },
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
    
  // ─────────────────────────────────────────────────────────────
  // POST /api/venta/checkout-session   (público)
  // body: { orderId }  ó { code }
  // ─────────────────────────────────────────────────────────────
    router.post('/checkout-session', async (req, res) => {
      if (!stripeReady) {
        logW('checkout-session llamado sin Stripe listo');
        return res.status(503).json({ error: 'Stripe no configurado' });
      }

      try {
        const { orderId, code } = req.body || {};
        const where = orderId ? { id: Number(orderId) } : { code: String(code) };

        const sale = await prisma.sale.findUnique({ where });
        if (!sale)  return res.status(404).json({ error: 'Pedido no existe' });
        if (sale.status === 'PAID') return res.status(400).json({ error: 'Pedido ya pagado' });

        const productsJson = Array.isArray(sale.products) ? sale.products : JSON.parse(sale.products || '[]');
        const extrasJson   = Array.isArray(sale.extras)   ? sale.extras   : JSON.parse(sale.extras || '[]');

        await prisma.$transaction(async (tx) => {
          await assertStock(tx, sale.storeId, productsJson);

          // Recalcula precios y cantidades seguras
          const { lineItems, total } = await recalcTotals(tx, sale.storeId, productsJson);

          // ---- Construir line_items de productos (nombre con ×cantidad si qty>1)
          const currency = String(sale.currency || 'EUR').toLowerCase();

          // Si recalcTotals no trae nombres, los resolvemos
          const ids = [...new Set(lineItems.map(li => Number(li.pizzaId)).filter(Boolean))];
          let nameById = new Map();
          if (ids.length) {
            const pizzas = await tx.menuPizza.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true }
            });
            nameById = new Map(pizzas.map(p => [p.id, p.name]));
          }

          const productLines = lineItems.map(li => {
            const qty = Number(li.qty || 1);
            const baseName =
              `${(li.name || nameById.get(Number(li.pizzaId)) || `#${li.pizzaId}`)}${li.size ? ` (${li.size})` : ''}`;
            const displayName = qty > 1 ? `${baseName} ×${qty}` : baseName;

            return {
              quantity: qty,
              price_data: {
                currency,
                unit_amount: Math.round(Number(li.price) * 100),
                product_data: {
                  name: displayName,
                  metadata: { pizzaId: String(li.pizzaId ?? ''), size: String(li.size ?? '') }
                }
              }
            };
          });

          // ---- Calcular gastos de envío (2,50 € por cada bloque de 5 pizzas)
          let shippingAmountCents = 0;
          if (sale.delivery === 'COURIER') {
            // 1) Si ya viene en extras (p.ej. [{code:'DELIVERY_FEE', amount:2.5}...]) lo sumamos:
            const extrasFromSale = (Array.isArray(extrasJson) ? extrasJson : [])
              .filter(ex => ex && typeof ex.amount === 'number');

            if (extrasFromSale.length) {
              shippingAmountCents = Math.round(
                extrasFromSale.reduce((s, e) => s + Number(e.amount || 0), 0) * 100
              );
            } else {
              // 2) Fallback: calculamos por cantidad total de pizzas
              const totalQty = lineItems.reduce((s, li) => s + Number(li.qty || 0), 0);
              const blocks = Math.ceil(totalQty / 5);
              shippingAmountCents = blocks * 250; // 2.50 € -> 250 céntimos
            }
          }

          // ---- Métodos de pago
          const pmTypes = ['card'];
          if (process.env.STRIPE_ENABLE_LINK === '1')   pmTypes.push('link');
          if (process.env.STRIPE_ENABLE_KLARNA === '1') pmTypes.push('klarna');

          // ---- Opciones de envío (para que aparezca como "Envío" en el resumen)
          const shippingOptions =
            sale.delivery === 'COURIER' && shippingAmountCents > 0
              ? [{
                  shipping_rate_data: {
                    display_name: 'Gastos de envío',
                    type: 'fixed_amount',
                    fixed_amount: { amount: shippingAmountCents, currency }
                  }
                }]
              : undefined;

          logI('Creando Stripe Checkout', {
            saleId: sale.id,
            lineItems: productLines.length,
            shippingCents: shippingAmountCents,
            currency,
            pmTypes
          });

          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: pmTypes,

            line_items: productLines,

            // Para que salga la fila "Envío" y capture la dirección
            shipping_address_collection: sale.delivery === 'COURIER' ? { allowed_countries: ['ES'] } : undefined,
            shipping_options: shippingOptions,

            phone_number_collection: { enabled: true },
            customer_email: sale.customerData?.email || undefined,
            billing_address_collection: 'auto',
            locale: 'es',

            success_url: `${process.env.FRONT_BASE_URL || 'http://localhost:3000'}/venta/success?order=${encodeURIComponent(sale.code)}`,
            cancel_url : `${process.env.FRONT_BASE_URL || 'http://localhost:3000'}/venta/cancel?order=${encodeURIComponent(sale.code)}`,

            metadata: {
              saleId  : String(sale.id),
              saleCode: sale.code || '',
              type    : sale.type,
              delivery: sale.delivery
            }
          });

          // Guardamos el total con envío
          const totalWithShipping = Number(total) + (shippingAmountCents / 100);

          await tx.sale.update({
            where: { id: sale.id },
            data : {
              total: totalWithShipping,
              stripeCheckoutSessionId: session.id,
              status: 'AWAITING_PAYMENT'
            }
          });

          logI('→ Stripe session creada', { id: session.id });
          res.json({ url: session.url });
        });

      } catch (e) {
        logE('[POST /api/venta/checkout-session] error', e);
        res.status(400).json({ error: e.message });
      }
    });
  // ─────────────────────────────────────────────────────────────
  // POST /api/venta/stripe/webhook   (Stripe → servidor)
  //
  // ⚠️ IMPORTANTE: monta este router **antes** de cualquier app.use(express.json())
  // en index.js, o define este endpoint a nivel app con express.raw.
  // ─────────────────────────────────────────────────────────────
  router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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
      const session = event.data.object;
      const checkoutId = session.id;
      const paymentIntent = session.payment_intent;

      try {
        await prisma.$transaction(async (tx) => {
          const sale = await tx.sale.findFirst({
            where: { stripeCheckoutSessionId: checkoutId },
          });
          if (!sale) {
            logW('Webhook session sin venta asociada', { checkoutId });
            return;
          }

          if (sale.status === 'PAID') {
            logI('Webhook idempotente (ya pagado)', { saleId: sale.id });
            return;
          }

          const items = Array.isArray(sale.products) ? sale.products : JSON.parse(sale.products || '[]');

          // Descontar stock ahora, al confirmar pago
          for (const p of items) {
            await tx.storePizzaStock.update({
              where: { storeId_pizzaId: { storeId: sale.storeId, pizzaId: Number(p.pizzaId) } },
              data : { stock: { decrement: Number(p.qty) } }
            });
          }

          await tx.sale.update({
            where: { id: sale.id },
            data : {
              status: 'PAID',
              stripePaymentIntentId: String(paymentIntent),
              processed: false // entra a "Pending orders"
            }
          });

          logI('Venta marcada como PAID', { saleId: sale.id });
        });
      } catch (e) {
        logE('[webhook] error al actualizar venta', e);
      }
    }

    res.json({ received: true });
  });

  // (opcional) estado rápido por código
  router.get('/status/:code', async (req, res) => {
    try {
      const sale = await prisma.sale.findUnique({
        where: { code: req.params.code },
        select: { status: true, processed: true, deliveredAt: true }
      });
      if (!sale) return res.status(404).json({ error: 'not found' });
      res.json(sale);
    } catch (e) {
      logE('[GET /status/:code] error', e);
      res.status(400).json({ error: 'bad request' });
    }
  });

  // (opcional) healthcheck para depurar configuración
  router.get('/_health', (req, res) => {
    res.json({
      ok: true,
      stripeReady,
      frontBaseUrl: process.env.FRONT_BASE_URL || 'http://localhost:3000'
    });
  });

  return router;
};
