// routes/ingredients.js
const express = require("express");
const {
  recomputeMenuPizzasForIngredient,
} = require("../services/recomputeMenuPizzasForIngredient");

module.exports = function (prisma) {
  const r = express.Router();

  const toUpperSafe = (v) => (v ?? "").toString().trim().toUpperCase();

  const parseId = (req) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  const parseNumberOrNull = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const parseIntOrZero = (v) => {
    if (v === "" || v === null || v === undefined) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  };

  /* GET /api/ingredients → list all */
  r.get("/", async (_, res) => {
    try {
      const data = await prisma.ingredient.findMany({
        orderBy: { id: "desc" },
      });
      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error fetching ingredients" });
    }
  });

  /* POST /api/ingredients → create new */
r.post("/", async (req, res) => {
  try {
    const { name, category, unit, costPrice } = req.body;

    if (!name?.toString().trim()) {
      return res.status(400).json({ error: "Name is required" });
    }
    if (!category?.toString().trim()) {
      return res.status(400).json({ error: "Category is required" });
    }

    const stores = await prisma.store.findMany({
      where: { active: true },
      select: { id: true },
    });

    if (!stores.length) {
      return res.status(400).json({
        error: "At least one store must exist before creating ingredients",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1️⃣ Crear ingrediente global
      const ingredient = await tx.ingredient.create({
        data: {
          name: toUpperSafe(name),
          category: toUpperSafe(category),
          unit: unit ? String(unit).trim() : null,
          costPrice: parseNumberOrNull(costPrice),
          stock: 0, // ya no se usa operativamente
        },
      });

      // 2️⃣ Crear filas por tienda
      await tx.storeIngredientStock.createMany({
        data: stores.map((s) => ({
          storeId: s.id,
          ingredientId: ingredient.id,
          stock: 0,
          active: true,
        })),
      });

      return ingredient;
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.meta?.cause || err.message });
  }
});


  /**
   * PATCH /api/ingredients/:id → edit fields
   */
  r.patch("/:id", async (req, res) => {
    try {
      const id = parseId(req);
      if (!id) {
        return res.status(400).json({ error: "Invalid id" });
      }

      const { name, category, stock, unit, costPrice } = req.body;
      const data = {};

      if (name !== undefined) {
        const n = toUpperSafe(name);
        if (!n) {
          return res.status(400).json({ error: "Name cannot be empty" });
        }
        data.name = n;
      }

      if (category !== undefined) {
        const c = toUpperSafe(category);
        if (!c) {
          return res.status(400).json({ error: "Category cannot be empty" });
        }
        data.category = c;
      }

      if (stock !== undefined) data.stock = parseIntOrZero(stock);

      if (unit !== undefined) {
        data.unit = unit ? String(unit).trim() : null;
      }

      if (costPrice !== undefined) {
        const cp = parseNumberOrNull(costPrice);
        if (
          costPrice !== "" &&
          costPrice !== null &&
          costPrice !== undefined &&
          cp === null
        ) {
          return res.status(400).json({ error: "Invalid costPrice" });
        }
        data.costPrice = cp;
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const updated = await prisma.ingredient.update({
        where: { id },
        data,
      });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.meta?.cause || err.message });
    }
  });

  /**
   * PATCH /api/ingredients/:id/status → set status
   * Body: { status: "ACTIVE" | "INACTIVE" }
   */
  r.patch("/:id/status", async (req, res) => {
    try {
      const id = parseId(req);
      if (!id) {
        return res.status(400).json({ error: "Invalid id" });
      }

      const status = toUpperSafe(req.body?.status);
      if (status !== "ACTIVE" && status !== "INACTIVE") {
        return res
          .status(400)
          .json({ error: "Invalid status (ACTIVE|INACTIVE)" });
      }

      const updated = await prisma.ingredient.update({
        where: { id },
        data: { status },
      });

      // 🔥 Recalcular pizzas afectadas (NO rompe la request)
      try {
        await recomputeMenuPizzasForIngredient(prisma, id);
      } catch (recomputeErr) {
        console.error(
          "[WARN] recomputeMenuPizzasForIngredient failed:",
          recomputeErr
        );
      }

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.meta?.cause || err.message });
    }
  });

  /* DELETE /api/ingredients/:id → remove */
  r.delete("/:id", async (req, res) => {
    try {
      const id = parseId(req);
      if (!id) {
        return res.status(400).json({ error: "Invalid id" });
      }

      await prisma.ingredient.delete({ where: { id } });
      res.json({ message: "Ingredient deleted", id });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.meta?.cause || err.message });
    }
  });

  return r;
};
