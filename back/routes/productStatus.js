// back/routes/productStatus.js
const express = require("express");

module.exports = (prisma) => {
  const r = express.Router();

  /**
   * GET /api/product-status
   * Backoffice only
   * Devuelve pizzas con estado calculado según ingredientes
   */
  r.get("/", async (_req, res) => {
    try {
      const pizzas = await prisma.pizza.findMany({
        select: {
          id: true,
          name: true,
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
        orderBy: { id: "asc" },
      });

      const result = pizzas.map((p) => {
        const ingredients = p.ingredients || [];

        const inactiveIngredients = ingredients.filter(
          (ing) => ing.status === "INACTIVE"
        );

        const computedStatus =
          inactiveIngredients.length > 0 ? "INACTIVE" : "ACTIVE";

        return {
          id: p.id,
          name: p.name,
          category: p.category,
          image: p.image,
          computedStatus,
          blockedBy: inactiveIngredients.map((ing) => ({
            id: ing.id,
            name: ing.name,
          })),
        };
      });

      res.json(result);
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: "No se pudo calcular el estado de los productos" });
    }
  });

  return r;
};
