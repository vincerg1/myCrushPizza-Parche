// back/routes/menuDisponible.js
const express = require("express");
const { computeProductStatus } = require("../services/productStatusService");

module.exports = (prisma) => {
  const r = express.Router();

  r.get("/:storeId", async (req, res) => {
    try {
      const storeId = Number(req.params.storeId);
      if (!storeId) return res.json([]);

      const rows = await prisma.storePizzaStock.findMany({
        where: {
          storeId,
          active: true, // StorePizzaStock
          pizza: { status: "ACTIVE" }, // MenuPizza (GLOBAL)
        },
        select: {
          pizzaId: true,
          stock: true,
          active: true,
          pizza: {
            select: {
              name: true,
              category: true,
              selectSize: true,
              priceBySize: true,
              image: true,
              ingredients: {
                select: {
                  qtyBySize: true,
                  ingredient: {
                    select: {
                      id: true,
                      name: true,
                      status: true, // GLOBAL Ingredient
                      storeStocks: {
                        where: { storeId },
                        select: { active: true, stock: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { pizzaId: "asc" },
      });

      const menu = rows
        .map((r) => {
          if (!r?.pizza) return null;

          const ingredientsAll = Array.isArray(r.pizza.ingredients)
            ? r.pizza.ingredients
            : [];

          // 🔒 EVALUACIÓN COMPLETA (GLOBAL + TIENDA)
          const recipeStatus = computeProductStatus(ingredientsAll);
          if (!recipeStatus.available) return null;

          const hasStock = r.stock == null || Number(r.stock) > 0;
          if (!hasStock) return null;

          // 👀 SOLO PARA MOSTRAR: ingredientes activos en esta tienda
          const visibleIngredients = ingredientsAll.filter((rel) => {
            const ing = rel.ingredient;
            const storeStock = ing?.storeStocks?.[0];
            return ing?.status === "ACTIVE" && storeStock?.active === true;
          });

          return {
            pizzaId: r.pizzaId,
            stock: r.stock ?? null,
            name: r.pizza.name,
            category: r.pizza.category,
            selectSize: r.pizza.selectSize ?? [],
            priceBySize: r.pizza.priceBySize ?? {},
            image: r.pizza.image ?? null,
            ingredients: visibleIngredients.map((rel) => ({
              id: rel.ingredient.id,
              name: rel.ingredient.name,
              qtyBySize: rel.qtyBySize,
            })),
            available: true,
          };
        })
        .filter(Boolean);

      res.json(menu);
    } catch (err) {
      console.error("🔥 menuDisponible error:", err);
      res.json([]);
    }
  });

  return r;
};
