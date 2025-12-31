// back/routes/menuDisponible.js
const express = require("express");
const auth = require("../middleware/auth");
const { computeProductStatus } = require("../services/productStatus");

module.exports = (prisma) => {
  const r = express.Router();

  r.get("/:storeId", async (req, res) => {
    try {
      const storeId = Number(req.params.storeId);
      const category = req.query.category;

      const where = {
        storeId,
        stock: { gt: 0 },
        ...(category ? { pizza: { category: String(category) } } : {}),
      };

      const rows = await prisma.storePizzaStock.findMany({
        where,
        select: {
          pizzaId: true,
          stock: true,
          pizza: {
            select: {
              id: true,
              name: true,
              selectSize: true,
              priceBySize: true,
              category: true,
              image: true,
              ingredients: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
        orderBy: { pizzaId: "asc" },
      });

      const menu = rows
        .filter((r) => r.pizza)
        .map((r) => {
          const status = computeProductStatus(r.pizza.ingredients);

          return {
            pizzaId: r.pizzaId,
            stock: r.stock,
            name: r.pizza.name,
            selectSize: r.pizza.selectSize,
            priceBySize: r.pizza.priceBySize,
            category: r.pizza.category,
            image: r.pizza.image,
            // ⚠️ SOLO PARA BACKOFFICE / DEBUG (opcional)
            // blockedBy: status.blockedBy,
            available: status.available,
          };
        })
        // ✅ AQUÍ está la regla de oro:
        .filter((p) => p.available);

      res.json(menu);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "No se pudo cargar el menú disponible" });
    }
  });

  return r;
};
