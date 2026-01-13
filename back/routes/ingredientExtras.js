const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/**
 * GET /api/ingredient-extras
 * Devuelve los extras agrupados por ingrediente
 */
router.get("/ingredient-extras", async (req, res) => {
  try {
    const rows = await prisma.ingredientExtra.findMany({
      where: { status: "ACTIVE" },
      include: {
        ingredient: true,
        category: true,
      },
      orderBy: {
        ingredientId: "asc",
      },
    });

    // Agrupar por ingrediente
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
      });
    }

    res.json(Object.values(map));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load ingredient extras" });
  }
});

/**
 * POST /api/ingredient-extras
 * body: { ingredientId, categoryIds: [] }
 * Sincroniza las categorías donde un ingrediente es extra
 */
router.post("/ingredient-extras", async (req, res) => {
  try {
    const { ingredientId, categoryIds } = req.body;

    if (!ingredientId || !Array.isArray(categoryIds)) {
      return res.status(400).json({ error: "ingredientId and categoryIds required" });
    }

    const ingId = Number(ingredientId);

    // Borrar relaciones anteriores
    await prisma.ingredientExtra.deleteMany({
      where: { ingredientId: ingId },
    });

    // Crear nuevas
    if (categoryIds.length > 0) {
      await prisma.ingredientExtra.createMany({
        data: categoryIds.map((catId) => ({
          ingredientId: ingId,
          categoryId: Number(catId),
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

/**
 * DELETE /api/ingredient-extras/:ingredientId
 * Quita un ingrediente como extra en todas las categorías
 */
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
