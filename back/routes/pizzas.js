const express = require('express');
const multer  = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { zeroStockForNewPizza } = require('../utils/stockSync');
module.exports = function (prisma) {
  const router = express.Router();

  /* ──────────────────────────────────────────
     GET /api/pizzas  – list all
  ────────────────────────────────────────── */
  router.get('/', async (_, res) => {
    try {
      const pizzas = await prisma.menuPizza.findMany({
        orderBy: { id: 'desc' },
      });
      res.json(pizzas);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error fetching pizzas' });
    }
  });

  /* ──────────────────────────────────────────
     POST /api/pizzas – create new (multipart)
  ────────────────────────────────────────── */
  router.post('/', upload.single('image'), async (req, res) => {
    try {
      /* los campos multipart llegan como strings */
      const {
        name,
        category,
        sizes,
        priceBySize,
        cookingMethod,
        ingredients,
      } = req.body;

      const data = {
        name:        name.trim(),
        category,
        selectSize:  JSON.parse(sizes       || '[]'),  // ["S","M"]
        priceBySize: JSON.parse(priceBySize || '{}'),  // { "S": 10 }
        cookingMethod,
        ingredients: JSON.parse(ingredients || '[]'),
        image:       req.file ? req.file.originalname : null,
      };

      const pizza = await prisma.menuPizza.create({ data });
      /* ← crea stock=0 en TODAS las tiendas existentes */
      await zeroStockForNewPizza(prisma, pizza.id);

      res.json(pizza);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  });
  router.delete('/:id', async (req, res) => {
        try {
          const id = Number(req.params.id);
          await prisma.menuPizza.delete({ where: { id } });
          res.json({ message: 'Pizza deleted', id });
        } catch (err) {
          console.error(err);
          res.status(400).json({ error: err.meta?.cause || err.message });
        }
  });
  return router;
};
