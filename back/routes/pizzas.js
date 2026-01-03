// routes/pizzas.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const { zeroStockForNewPizza } = require("../utils/stockSync");
const {
  recomputeMenuPizzaStatus,
} = require("../services/recomputeMenuPizzaStatus");

/* ───────────── Multer config (DISK) ───────────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), "uploads"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = file.originalname
      .replace(ext, "")
      .replace(/\s+/g, "-")
      .toLowerCase();

    cb(null, `${Date.now()}-${safeName}${ext}`);
  },
});

const upload = multer({ storage });

module.exports = function (prisma) {
  const router = express.Router();

  /* GET /api/pizzas */
  router.get("/", async (_, res) => {
    try {
      const pizzas = await prisma.menuPizza.findMany({
        orderBy: { id: "desc" },
        include: {
          ingredients: {
            include: { ingredient: true },
          },
        },
      });

      const normalized = pizzas.map((p) => ({
        ...p,
        ingredients: (p.ingredients || []).map((rel) => ({
          id: rel.ingredientId,
          name: rel.ingredient?.name,
          qtyBySize: rel.qtyBySize,
          status: rel.ingredient?.status,
        })),
      }));

      res.json(normalized);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error fetching pizzas" });
    }
  });

  /* POST /api/pizzas */
  router.post("/", upload.single("image"), async (req, res) => {
    try {
      const { name, category, sizes, priceBySize, cookingMethod, ingredients } =
        req.body;

      if (!name || !category) {
        return res.status(400).json({ error: "Name and category required" });
      }

      const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

      const ingArr = JSON.parse(ingredients || "[]");
      const ingredientRelations = (Array.isArray(ingArr) ? ingArr : [])
        .filter((x) => Number(x?.id))
        .map((x) => ({
          ingredient: { connect: { id: Number(x.id) } },
          qtyBySize: x.qtyBySize || {},
        }));

      const pizza = await prisma.menuPizza.create({
        data: {
          name: name.trim(),
          category,
          selectSize: JSON.parse(sizes || "[]"),
          priceBySize: JSON.parse(priceBySize || "{}"),
          cookingMethod: cookingMethod || null,
          image: imagePath,
          ingredients: {
            create: ingredientRelations,
          },
        },
      });

      // 🔥 cálculo de status CENTRALIZADO
      await recomputeMenuPizzaStatus(prisma, pizza.id);

      await zeroStockForNewPizza(prisma, pizza.id);

      res.json(pizza);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  });

  /* DELETE /api/pizzas/:id */
  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      await prisma.menuPizza.delete({ where: { id } });
      res.json({ message: "Pizza deleted", id });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.meta?.cause || err.message });
    }
  });

  return router;
};
