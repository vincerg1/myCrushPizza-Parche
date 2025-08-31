/* eslint-disable consistent-return */
const auth = require('../middleware/auth');
const sendSMS = require('../utils/sendSMS');

module.exports = (prisma) => {
  const r = require('express').Router();

  /* ───────── helpers ───────── */
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

  /* ───────────────────────── POST /api/sales ───────────────────────── */
  r.post('/', auth(), async (req, res) => {
    try {
      const {
        storeId: storeIdBody,
        type, delivery, customer,
        products, extras = [],
        discounts = 0, notes = '',
      } = req.body;

      /* storeId según rol ------------------------------ */
      let storeId;
      if (req.user.role === 'store') {
        const s = await prisma.store.findFirst({
          where: { storeName: req.user.storeName }
        });
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

      /* totales ---------------------------------------- */
      const totalProducts = products
        .reduce((t, p) => t + Number(p.price) * Number(p.qty), 0);
      const total = totalProducts - Number(discounts);

      /* transacción ------------------------------------ */
      const sale = await prisma.$transaction(async (tx) => {
        /* (a) stock */
        for (const p of products) {
          const stk = await tx.storePizzaStock.findUnique({
            where : { storeId_pizzaId: { storeId, pizzaId: p.pizzaId } },
            select: { stock: true }
          });
          if (!stk || stk.stock < p.qty)
            throw new Error(`Stock insuficiente para pizza ${p.pizzaId}`);
        }

        /* (b) código público */
        const publicCode = await genOrderCode(tx);

        /* (c) crear venta */
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
            extras,
            totalProducts,
            discounts,
            total,
            notes
          }
        });

        /* (d) restar stock */
        for (const p of products) {
          await tx.storePizzaStock.update({
            where:{ storeId_pizzaId:{ storeId, pizzaId:p.pizzaId }},
            data :{ stock:{ decrement:p.qty }}
          });
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
          NOT: { status: 'AWAITING_PAYMENT' } // ← excluye impagadas; incluye PAID y también NULL
        },
        orderBy: { date: 'asc' },
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

    /* ─────────────── PATCH /api/sales/:id/ready ─────────── */
  r.patch('/:id/ready', auth(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const sale = await prisma.sale.update({
      where : { id },
      data  : { processed: true },
      select: {
        id: true, code: true, type: true, delivery: true, customerData: true,
        store: { select: { storeName: true } }
      }
    });

    // Helper: primer nombre capitalizado
    const firstName = (raw) => {
      if (!raw || typeof raw !== 'string') return '';
      const clean = raw.replace(/\s+/g, ' ').trim();
      if (!clean) return '';
      const [w] = clean.split(' ');
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    };

    const tienda = sale?.store?.storeName || 'myCrushPizza';
    const phone  = sale?.customerData?.phone?.trim();
    const nombre = firstName(sale?.customerData?.name);

    if (phone) {
      const rawType = String(sale.type || '').trim().toLowerCase();
      const byBool  = sale.delivery === true || sale.delivery === 1 || sale.delivery === '1';
      const byType  = ['delivery','del','reparto','envío','envio'].includes(rawType);
      const isDelivery = byBool || byType;

      const saludo = nombre ? `Hola ${nombre}, ` : '';

      const msg = isDelivery
        ? `${saludo}tu pedido ${sale.code} está listo y saldrá a reparto en breve desde ${tienda}.`
        : `${saludo}tu pedido ${sale.code} está listo para recoger en ${tienda}. ¡Gracias!`;

      sendSMS(phone, msg).catch(err =>
        console.error('[Twilio SMS error READY]', {
          err: err.message, saleId: sale.id, rawType, delivery: sale.delivery
        })
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[PATCH /ready]', e);
    res.status(400).json({ error: e.message });
  }
  });

  /* ────────────── GET /api/sales (histórico) ───────────── */
  r.get('/', auth(), async (req, res) => {
    const { storeId, from, to } = req.query;

    const rows = await prisma.sale.findMany({
      where:{
        storeId: storeId ? Number(storeId) : undefined,
        date:{
          gte: from ? new Date(from) : undefined,
          lte: to   ? new Date(to)   : undefined
        }
      },
      orderBy:{ date:'desc' }
    });

    const list = rows.map(s => ({
      ...s,
      date: s.date.toLocaleString('es-ES',{
        day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit'
      })
    }));
    res.json(list);
  });

  r.get('/public/order/:code', async (req, res) => {
    try {
      const order = await prisma.sale.findUnique({
        where: { code: req.params.code },
        select: {
          code: true,
          date: true,
          deliveredAt: true,
          processed: true,
          customerData: true,
        },
      });
      if (!order) throw new Error('not found');

      const cd = order.customerData || {};
      res.json({
        orderCode : order.code,
        date      : order.date,        // ISO
        deliveredAt: order.deliveredAt,
        name  : cd.name  ?? null,
        phone : cd.phone ?? null,
        addr  : cd.addr ?? cd.address_1 ?? cd.address ?? null,
        lat   : cd.lat   ?? null,
        lng   : cd.lng   ?? null,
      });
    } catch {
      res.status(404).json({ error:'Order not found' });
    }
  });

  r.patch('/public/order/:code/delivered', async (req, res) => {
    try {
      const sale = await prisma.sale.update({
        where : { code: req.params.code },
        data  : { deliveredAt: new Date() },
        select: {
          deliveredAt : true,
          customerData: true
        }
      });

      const phone = sale.customerData?.phone;
      if (phone) {
        sendSMS(
          phone,
          '📦 Pedido entregado. ¡Buen provecho! 🍕 myCrushPizza :)'
        ).catch(err => console.error('[Twilio SMS error]', err.message));
      }

      res.json({ ok:true, deliveredAt: sale.deliveredAt });
    } catch (e) {
      console.error('[PATCH delivered]', e);
      res.status(404).json({ error:'Order not found' });
    }
  });

  return r;
};
