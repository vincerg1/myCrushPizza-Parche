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
// GET /api/menuDisponible/:storeId
r.get('/:storeId', async (req, res) => {
  try {
    const storeId  = Number(req.params.storeId);
    const category = req.query.category; // ← opcional

    // where base
    const where = {
      storeId,
      stock: { gt: 0 },
      // Sólo aplicamos el filtro por categoría si lo pasan en la query
      ...(category ? { pizza: { category: String(category) } } : {}),
    };

    const rows = await prisma.storePizzaStock.findMany({
      where,
      select: {
        pizzaId: true,
        stock  : true,
        pizza  : {
          select: {
            name       : true,
            selectSize : true,
            priceBySize: true,
            category   : true,
          }
        }
      },
      orderBy: { pizzaId: 'asc' }
    });

    console.log(
      `[MENÚ] tienda ${storeId} / categoría ${category ?? 'ALL'}:`,
      rows.length, 'items'
    );

    res.json(rows
      .filter(r => r.pizza) // por seguridad
      .map(r => ({
        pizzaId     : r.pizzaId,
        stock       : r.stock,
        name        : r.pizza.name,
        selectSize  : r.pizza.selectSize,
        priceBySize : r.pizza.priceBySize,
        category    : r.pizza.category,
      })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo cargar el menú disponible' });
  }
});


  return r;
};
