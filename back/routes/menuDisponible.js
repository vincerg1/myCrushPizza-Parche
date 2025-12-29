// back/routes/menuDisponible.js
const express = require("express");
const auth = require("../middleware/auth");

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
              name: true,
              selectSize: true,
              priceBySize: true,
              category: true,
              image: true,
              ingredients: true, 
            },
          },
        },
        orderBy: { pizzaId: "asc" },
      });

      res.json(
        rows
          .filter((r) => r.pizza)
          .map((r) => ({
            pizzaId: r.pizzaId,
            stock: r.stock,
            name: r.pizza.name,
            selectSize: r.pizza.selectSize,
            priceBySize: r.pizza.priceBySize,
            category: r.pizza.category,
            image: r.pizza.image,
            ingredients: r.pizza.ingredients ?? [], 
          }))
      );
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "No se pudo cargar el menú disponible" });
    }
  });

  return r;
};
