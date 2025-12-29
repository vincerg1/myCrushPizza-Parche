const express = require("express");
const multer = require("multer");
const path = require("path");
const { zeroStockForNewPizza } = require("../utils/stockSync");

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

/* ─────────────────────────────────────────────── */

module.exports = function (prisma) {
  const router = express.Router();

  /* ──────────────────────────────────────────
     GET /api/pizzas – list all
  ────────────────────────────────────────── */
  router.get("/", async (_, res) => {
    try {
      const pizzas = await prisma.menuPizza.findMany({
        orderBy: { id: "desc" },
      });
      res.json(pizzas);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error fetching pizzas" });
    }
  });

  /* ──────────────────────────────────────────
     POST /api/pizzas – create new (multipart)
  ────────────────────────────────────────── */
  router.post("/", upload.single("image"), async (req, res) => {
    try {
      const {
        name,
        category,
        sizes,
        priceBySize,
        cookingMethod,
        ingredients,
      } = req.body;

      if (!name || !category) {
        return res.status(400).json({ error: "Name and category required" });
      }

      const imagePath = req.file
        ? `/uploads/${req.file.filename}`
        : null;

      const pizza = await prisma.menuPizza.create({
        data: {
          name: name.trim(),
          category,
          selectSize: JSON.parse(sizes || "[]"),
          priceBySize: JSON.parse(priceBySize || "{}"),
          cookingMethod: cookingMethod || null,
          ingredients: JSON.parse(ingredients || "[]"),
          image: imagePath,
        },
      });

      // 🔥 crea stock=0 en TODAS las tiendas
      await zeroStockForNewPizza(prisma, pizza.id);

      res.json(pizza);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  });

  /* ──────────────────────────────────────────
     DELETE /api/pizzas/:id
  ────────────────────────────────────────── */
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
