// routes/stock.js
const express = require('express');
const auth    = require('../middleware/auth'); // auth() – permite admin y store

module.exports = prisma => {
  const r = express.Router();

  /* ───────────────────── GET /api/stock/:storeId ───────────────────── */
  r.get('/:storeId', auth(), async (req, res) => {
    const storeId = Number(req.params.storeId);

    /* ── seguridad ──: la tienda sólo puede ver su propio stock */
    if (req.user.role === 'store' && req.user.storeId !== storeId) {
      return res.sendStatus(403);
    }

    const rows = await prisma.storePizzaStock.findMany({
      where  : { storeId },
      include: { pizza: { select: { id: true, name: true } } },
      orderBy: { pizzaId: 'asc' }
    });

    res.json(rows);
  });

  /* ────────────────── PATCH /api/stock/:storeId/:pizzaId ────────────── */
  r.patch('/:storeId/:pizzaId', auth(), async (req, res) => {
    const storeId = Number(req.params.storeId);
    const pizzaId = Number(req.params.pizzaId);
    const { set, delta } = req.body;

    /* ── seguridad ──: la tienda sólo puede modificar su propio stock */
    if (req.user.role === 'store' && req.user.storeId !== storeId) {
      return res.sendStatus(403);
    }

    /* al menos uno de los campos */
    if (set === undefined && delta === undefined) {
      return res.status(400).json({ error: 'set o delta requerido' });
    }

    const data =
      set !== undefined
        ? { stock: Number(set) }
        : { stock: { increment: Number(delta) } };

    try {
      const updated = await prisma.storePizzaStock.update({
        where: { storeId_pizzaId: { storeId, pizzaId } },
        data
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  });

  return r;
};
