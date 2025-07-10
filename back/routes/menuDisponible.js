// back/routes/menuDisponible.js
const express = require('express');
const auth    = require('../middleware/auth');      // ← protege la ruta

module.exports = prisma => {
  const r = express.Router();

  /* ------------------------------------------------------------
     GET /api/menuDisponible/:storeId
     Query opcional ?category=Pizza | Extras | Sides | Drinks | …
     Devuelve SOLO los productos con stock > 0 en esa tienda
     ------------------------------------------------------------ */
r.get('/:storeId', async (req, res) => {
  const storeId  = Number(req.params.storeId);
  const category = req.query.category ?? 'Pizza';

  const rows = await prisma.storePizzaStock.findMany({
    where : { storeId, stock: { gt: 0 }, pizza: { category } },
    select: {
      pizzaId: true,
      stock  : true,
      pizza  : {                 // ← nombre, tamaños, precios…
        select: {
          name       : true,
          selectSize : true,
          priceBySize: true,
          category   : true
        }
      }
    },
    orderBy: { pizzaId: 'asc' }
  });

  /* 👇  este log lo veremos en la consola del backend */
  console.log(`[MENÚ] tienda ${storeId} / categoría ${category}:`, rows.length, 'items');

  res.json(rows.map(r => ({
    pizzaId     : r.pizzaId,
    stock       : r.stock,
    name        : r.pizza.name,
    selectSize  : r.pizza.selectSize,
    priceBySize : r.pizza.priceBySize,
    category    : r.pizza.category
  })));
});

  return r;
};
