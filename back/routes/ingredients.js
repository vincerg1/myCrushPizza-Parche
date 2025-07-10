// routes/ingredients.js
const express = require('express');

module.exports = function (prisma) {
  const r = express.Router();

  /* GET /api/ingredients → list all */
  r.get('/', async (_, res) => {
    try {
      const data = await prisma.ingredient.findMany({ orderBy: { id: 'desc' } });
      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error fetching ingredients' });
    }
  });

  /* POST /api/ingredients → create new */
  r.post('/', async (req, res) => {
    try {
      const { name, category, stock, unit, costPrice } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }
      const ingredient = await prisma.ingredient.create({
        data: {
          name: name.trim(),
          category,
          stock: Number(stock) || 0,
          unit,
          costPrice: costPrice ? Number(costPrice) : null,
        },
      });
      res.json(ingredient);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  });

  /* DELETE /api/ingredients/:id → remove */
  r.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      await prisma.ingredient.delete({ where: { id } });
      res.json({ message: 'Ingredient deleted', id });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.meta?.cause || err.message });
    }
  });

  return r;          // ← SIEMPRE al final, después de definir todas las rutas
};
