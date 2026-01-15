const express = require("express");

module.exports = function (prisma) {
  const r = express.Router();

  const parseId = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  /* 
   * GET /api/stores/:storeId/ingredients
   */
  r.get("/", async (req, res) => {
    try {
      const storeId = parseId(req.params.storeId);
      if (!storeId) {
        return res.status(400).json({ error: "Invalid storeId" });
      }

      const ingredients = await prisma.ingredient.findMany({
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

      const result = ingredients.map((ing) => {
        const storeStock = ing.storeStocks[0];

        return {
          id: ing.id,
          name: ing.name,
          category: ing.category,
          unit: ing.unit,
          costPrice: ing.costPrice,
          active: storeStock ? storeStock.active : true,
          stock: storeStock ? storeStock.stock : 0,
        };
      });

      res.json(result);
    } catch (err) {
      console.error("[GET store ingredients]", err);
      res.status(500).json({ error: "Error fetching store ingredients" });
    }
  });

  /*
   * PATCH /api/stores/:storeId/ingredients/:ingredientId
   */
  r.patch("/:ingredientId", async (req, res) => {
    try {
      const storeId = parseId(req.params.storeId);
      const ingredientId = parseId(req.params.ingredientId);
      if (!storeId || !ingredientId) {
        return res.status(400).json({ error: "Invalid ids" });
      }

      const { active, stock } = req.body;
      const data = {};

      if (active !== undefined) data.active = Boolean(active);
      if (stock !== undefined) {
        const n = Number(stock);
        if (!Number.isFinite(n) || n < 0)
          return res.status(400).json({ error: "Invalid stock" });
        data.stock = Math.trunc(n);
      }

      const updated = await prisma.storeIngredientStock.upsert({
        where: {
          storeId_ingredientId: { storeId, ingredientId },
        },
        update: data,
        create: {
          storeId,
          ingredientId,
          stock: data.stock ?? 0,
          active: data.active ?? true,
        },
      });

      res.json(updated);
    } catch (err) {
      console.error("[PATCH store ingredient]", err);
      res.status(400).json({ error: err.message });
    }
  });

  /*
   * POST /api/stores/:storeId/ingredients/init
   */
  r.post("/init", async (req, res) => {
    try {
      const storeId = parseId(req.params.storeId);
      if (!storeId) {
        return res.status(400).json({ error: "Invalid storeId" });
      }

      const ingredients = await prisma.ingredient.findMany({
        select: { id: true },
      });

      const data = ingredients.map((i) => ({
        storeId,
        ingredientId: i.id,
        stock: 0,
        active: true,
      }));

      const result = await prisma.storeIngredientStock.createMany({
        data,
        skipDuplicates: true,
      });

      res.json({ created: result.count });
    } catch (err) {
      console.error("[INIT store ingredients]", err);
      res.status(500).json({ error: "Error initializing ingredients" });
    }
  });

  return r;
};
