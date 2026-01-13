const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();


router.get("/ingredient-extras", async (req, res) => {
  try {
    const { categoryId } = req.query;

    if (!categoryId) {
      return res.status(400).json({ error: "categoryId required" });
    }

    const rows = await prisma.ingredientExtra.findMany({
      where: {
        status: "ACTIVE",
        categoryId: Number(categoryId),
      },
      include: {
        ingredient: true,
      },
      orderBy: {
        ingredient: { name: "asc" },
      },
    });

    res.json(
      rows.map(r => ({
        ingredientId: r.ingredientId,
        name: r.ingredient.name,
        price: Number(r.price),
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load ingredient extras" });
  }
});
router.get("/ingredient-extras/all", async (req, res) => {
  try {
    const rows = await prisma.ingredientExtra.findMany({
      where: { status: "ACTIVE" },
      include: {
        ingredient: true,
        category: true,
      },
      orderBy: { ingredientId: "asc" },
    });

    const map = {};

    for (const row of rows) {
      if (!map[row.ingredientId]) {
        map[row.ingredientId] = {
          ingredientId: row.ingredientId,
          ingredientName: row.ingredient.name,
          categories: [],
        };
      }

      map[row.ingredientId].categories.push({
        id: row.category.id,
        name: row.category.name,
        price: Number(row.price),
      });
    }

    res.json(Object.values(map));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load ingredient extras" });
  }
});
router.post("/ingredient-extras", async (req, res) => {
  try {
    const { ingredientId, links } = req.body;

    if (!ingredientId || !Array.isArray(links)) {
      return res.status(400).json({
        error: "ingredientId and links[] required",
      });
    }

    const ingId = Number(ingredientId);

    // Validar estructura
    for (const l of links) {
      if (!l.categoryId || l.price == null || isNaN(Number(l.price))) {
        return res.status(400).json({
          error: "Each link must have categoryId and price",
        });
      }
    }

    // Borrar relaciones anteriores del ingrediente
    await prisma.ingredientExtra.deleteMany({
      where: { ingredientId: ingId },
    });

    // Insertar nuevas relaciones con precio
    if (links.length > 0) {
      await prisma.ingredientExtra.createMany({
        data: links.map((l) => ({
          ingredientId: ingId,
          categoryId: Number(l.categoryId),
          price: Number(l.price),
          status: "ACTIVE",
        })),
      });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save ingredient extras" });
  }
});
router.delete("/ingredient-extras/:ingredientId", async (req, res) => {
  try {
    const ingredientId = Number(req.params.ingredientId);

    await prisma.ingredientExtra.deleteMany({
      where: { ingredientId },
    });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete ingredient extras" });
  }
});

module.exports = router;
