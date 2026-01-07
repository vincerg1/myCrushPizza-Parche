// routes/stock.js
const express = require('express');
const auth    = require('../middleware/auth'); // auth() – permite admin y store

module.exports = prisma => {
  const r = express.Router();

r.get('/:storeId', auth(), async (req, res) => {
  const storeId = Number(req.params.storeId);

  if (req.user.role === 'store' && req.user.storeId !== storeId) {
    return res.sendStatus(403);
  }

  try {
    const pizzas = await prisma.menuPizza.findMany({
      orderBy: { name: 'asc' }
    });

    const stockRows = await prisma.storePizzaStock.findMany({
      where: { storeId }
    });

    const stockMap = new Map(
      stockRows.map(r => [r.pizzaId, r.stock])
    );

    const result = pizzas.map(p => ({
      pizzaId: p.id,                    // ✅ AQUÍ estaba el bug
      pizza: {
        id: p.id,
        name: p.name,
        category: p.category
      },
      stock: stockMap.get(p.id) ?? 0,
    }));

    res.json(result);
  } catch (err) {
    console.error('[STOCK GET ERROR]', err);
    res.status(500).json({ error: 'Error loading stock' });
  }
});
r.patch('/:storeId/:pizzaId', auth(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const pizzaId = Number(req.params.pizzaId);
  const { set, delta } = req.body;

  if (Number.isNaN(storeId) || Number.isNaN(pizzaId)) {
    return res.status(400).json({ error: 'Invalid ids' });
  }

  if (req.user.role === 'store' && req.user.storeId !== storeId) {
    return res.sendStatus(403);
  }

  if (set === undefined && delta === undefined) {
    return res.status(400).json({ error: 'set o delta requerido' });
  }

  try {
    const updated = await prisma.storePizzaStock.upsert({
      where: {
        storeId_pizzaId: { storeId, pizzaId }
      },
      update: {
        stock:
          set !== undefined
            ? Number(set)
            : { increment: Number(delta) }
      },
      create: {
        storeId,
        pizzaId,
        stock: Number(set ?? delta ?? 0),
        active: true
      }
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});
r.patch('/:storeId/:pizzaId/active', auth(), async (req, res) => {
  const storeId = Number(req.params.storeId);
  const pizzaId = Number(req.params.pizzaId);
  const { active } = req.body;

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active boolean requerido' });
  }

  if (req.user.role === 'store' && req.user.storeId !== storeId) {
    return res.sendStatus(403);
  }

  try {
    const updated = await prisma.storePizzaStock.upsert({
      where: { storeId_pizzaId: { storeId, pizzaId } },
      update: { active },
      create: {
        storeId,
        pizzaId,
        stock: 0,
        active
      }
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle active' });
  }
});

  return r;
};
