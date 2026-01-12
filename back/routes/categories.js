// routes/categories.js
const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/**
 * GET /api/categories
 * Devuelve todas las categorías ordenadas por position ASC
 */
router.get("/categories", async (req, res) => {
  try {
    const rows = await prisma.category.findMany({
      orderBy: { position: "asc" },
    });
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load categories" });
  }
});

/**
 * POST /api/categories
 * Crea una categoría nueva
 * body: { name: "Pizza Básica" }
 */
router.post("/categories", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name required" });
    }

    // calcular la siguiente posición
    const max = await prisma.category.findFirst({
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const position = (max?.position ?? -1) + 1;

    const row = await prisma.category.create({
      data: {
        name: name.trim(),
        position,
      },
    });

    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create category" });
  }
});

/**
 * PATCH /api/categories/order
 * body: { orderedIds: [3,1,2,...] }
 */
router.patch("/categories/order", async (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: "orderedIds required" });
    }

    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.category.update({
          where: { id: Number(id) },
          data: { position: idx },
        })
      )
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to reorder categories" });
  }
});

/**
 * DELETE /api/categories/:id
 */
router.delete("/categories/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.category.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

module.exports = router;
