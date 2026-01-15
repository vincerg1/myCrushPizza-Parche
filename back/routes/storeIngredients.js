const express = require("express");

module.exports = function (prisma) {
  const r = express.Router();

  const parseId = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  /* 
   * GET /api/stores/:storeId/ingredients
   * Devuelve catálogo + estado por tienda
   */
  r.get("/:storeId/ingredients", async (req, res) => {
    try {
      const storeId = parseId(req.params.storeId);
      if (!storeId) return res.status(400).json({ error: "Invalid storeId" });

      const data = await prisma.ingredient.findMany({
        orderBy: { name: "asc" },
        include: {
          storeStocks: {
            where: { storeId },
            select: {
              active: true,
              stock: true,
            },
          },
        },
      });

      const result = data.map((ing) => {
        const store = ing.storeStocks[0] || { active: true, stock: 0 };
        return {
          id: ing.id,
          name: ing.name,
          category: ing.category,
          unit: ing.unit,
          costPrice: ing.costPrice,
          active: store.active,
          stock: store.stock,
        };
      });

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error fetching store ingredients" });
    }
  });

  /*
   * PATCH /api/stores/:storeId/ingredients/:ingredientId
   * Actualiza active y/o stock
   */
  r.patch("/:storeId/ingredients/:ingredientId", async (req, res) => {
    try {
      const storeId = parseId(req.params.storeId);
      const ingredientId = parseId(req.params.ingredientId);
      if (!storeId || !ingredientId) {
        return res.status(400).json({ error: "Invalid ids" });
      }

      const { active, stock } = req.body;
      const data = {};

      if (active !== undefined) data.active = !!active;
      if (stock !== undefined) {
        const n = Number(stock);
        if (!Number.isFinite(n) || n < 0)
          return res.status(400).json({ error: "Invalid stock" });
        data.stock = Math.trunc(n);
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: "Nothing to update" });
      }

      const updated = await prisma.storeIngredientStock.upsert({
        where: {
          storeId_ingredientId: { storeId, ingredientId },
        },
        update: data,
        create: {
          storeId,
          ingredientId,
          ...data,
        },
      });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  });

  /*
   * POST /api/stores/:storeId/ingredients/init
   * Inicializa todos los ingredientes para una tienda
   */
  r.post("/:storeId/ingredients/init", async (req, res) => {
    try {
      const storeId = parseId(req.params.storeId);
      if (!storeId) return res.status(400).json({ error: "Invalid storeId" });

      const ingredients = await prisma.ingredient.findMany({
        select: { id: true },
      });

      const data = ingredients.map((i) => ({
        storeId,
        ingredientId: i.id,
        stock: 0,
        active: true,
      }));

      await prisma.storeIngredientStock.createMany({
        data,
        skipDuplicates: true,
      });

      res.json({ created: data.length });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error initializing ingredients" });
    }
  });

  return r;
};
