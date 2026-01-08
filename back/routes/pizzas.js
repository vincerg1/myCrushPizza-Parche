// routes/pizzas.js
const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { zeroStockForNewPizza } = require("../utils/stockSync");
const { recomputeMenuPizzaStatus } = require("../services/recomputeMenuPizzaStatus");

/* ───────── Cloudinary config ───────── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ───────── Multer (memory) ───────── */
const upload = multer({ storage: multer.memoryStorage() });

module.exports = function (prisma) {
  const router = express.Router();

  /* GET /api/pizzas */
  router.get("/", async (_, res) => {
    try {
      const pizzas = await prisma.menuPizza.findMany({
        orderBy: { id: "desc" },
        include: {
          ingredients: { include: { ingredient: true } },
        },
      });

      res.json(
        pizzas.map((p) => ({
          ...p,
          ingredients: (p.ingredients || []).map((rel) => ({
            id: rel.ingredientId,
            name: rel.ingredient?.name,
            qtyBySize: rel.qtyBySize,
            status: rel.ingredient?.status,
          })),
        }))
      );
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

      let image = null;
      let imagePublicId = null;

      if (req.file) {
        const uploadRes = await cloudinary.uploader.upload(
          `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
          { folder: "pizzas" }
        );
        image = uploadRes.secure_url;
        imagePublicId = uploadRes.public_id;
      }

      const ingArr = JSON.parse(ingredients || "[]");
      const ingredientRelations = ingArr
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
          image,
          imagePublicId,
          ingredients: { create: ingredientRelations },
        },
      });

      await recomputeMenuPizzaStatus(prisma, pizza.id);
      await zeroStockForNewPizza(prisma, pizza.id);

      res.json(pizza);
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  });

  /* PUT /api/pizzas/:id */
  router.put("/:id", upload.single("image"), async (req, res) => {
    try {
      const id = Number(req.params.id);

      const existing = await prisma.menuPizza.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Pizza not found" });

      const parsedSizes = JSON.parse(req.body.sizes || "[]");
      const parsedPrices = JSON.parse(req.body.priceBySize || "{}");
      const parsedIngredients = JSON.parse(req.body.ingredients || "[]");

      let image = existing.image;
      let imagePublicId = existing.imagePublicId;

      if (req.file) {
        // 🔥 borrar imagen vieja
        if (existing.imagePublicId) {
          await cloudinary.uploader.destroy(existing.imagePublicId);
        }

        const uploadRes = await cloudinary.uploader.upload(
          `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
          { folder: "pizzas" }
        );

        image = uploadRes.secure_url;
        imagePublicId = uploadRes.public_id;
      }

      await prisma.menuPizza.update({
        where: { id },
        data: {
          name: req.body.name?.trim() ?? existing.name,
          category: req.body.category ?? existing.category,
          selectSize: parsedSizes,
          priceBySize: parsedPrices,
          cookingMethod: req.body.cookingMethod ?? null,
          image,
          imagePublicId,
        },
      });

      await prisma.menuPizzaIngredient.deleteMany({
        where: { menuPizzaId: id },
      });

      if (parsedIngredients.length) {
        await prisma.menuPizzaIngredient.createMany({
          data: parsedIngredients
            .filter((x) => Number(x?.id))
            .map((x) => ({
              menuPizzaId: id,
              ingredientId: Number(x.id),
              qtyBySize: x.qtyBySize || {},
            })),
        });
      }

      await recomputeMenuPizzaStatus(prisma, id);

      res.json({ ok: true, id });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  });

  /* DELETE /api/pizzas/:id */
  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const pizza = await prisma.menuPizza.findUnique({ where: { id } });

      if (pizza?.imagePublicId) {
        await cloudinary.uploader.destroy(pizza.imagePublicId);
      }

      await prisma.menuPizza.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  });

  return router;
};
