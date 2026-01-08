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
  console.log("➡️ POST /api/pizzas");
  console.log("BODY keys:", Object.keys(req.body));
  console.log("FILE:", req.file ? {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  } : "NO FILE");

  try {
    const { name, category, sizes, priceBySize, cookingMethod, ingredients } = req.body;

    if (!name || !category) {
      console.error("❌ Missing name or category", { name, category });
      return res.status(400).json({ error: "Name and category required" });
    }

    /* ───────── SAFE JSON PARSE ───────── */
    let parsedSizes = [];
    let parsedPrices = {};
    let parsedIngredients = [];

    try {
      parsedSizes = sizes ? JSON.parse(sizes) : [];
      parsedPrices = priceBySize ? JSON.parse(priceBySize) : {};
      parsedIngredients = ingredients ? JSON.parse(ingredients) : [];
    } catch (e) {
      console.error("❌ JSON parse error", {
        sizes,
        priceBySize,
        ingredients,
      });
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    console.log("✅ Parsed payload", {
      parsedSizes,
      parsedPrices,
      parsedIngredientsCount: parsedIngredients.length,
    });

    /* ───────── CLOUDINARY ───────── */
    let image = null;
    let imagePublicId = null;

    if (req.file) {
      console.log("☁️ Uploading image to Cloudinary...");
      console.log("Cloudinary ENV:", {
        cloud: process.env.CLOUDINARY_CLOUD_NAME,
        key: process.env.CLOUDINARY_API_KEY,
        secret: !!process.env.CLOUDINARY_API_SECRET,
      });

      try {
        const uploadRes = await cloudinary.uploader.upload(
          `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
          { folder: "pizzas" }
        );

        image = uploadRes.secure_url;
        imagePublicId = uploadRes.public_id;

        console.log("✅ Cloudinary upload OK", {
          image,
          imagePublicId,
        });
      } catch (cloudErr) {
        console.error("❌ Cloudinary upload failed", cloudErr);
        return res.status(400).json({ error: "Image upload failed" });
      }
    }

    /* ───────── INGREDIENTS ───────── */
    const ingredientRelations = parsedIngredients
      .filter((x) => Number(x?.id))
      .map((x) => ({
        ingredient: { connect: { id: Number(x.id) } },
        qtyBySize: x.qtyBySize || {},
      }));

    console.log("🧩 Ingredient relations:", ingredientRelations.length);

    /* ───────── PRISMA CREATE ───────── */
    const pizza = await prisma.menuPizza.create({
      data: {
        name: name.trim(),
        category,
        selectSize: parsedSizes,
        priceBySize: parsedPrices,
        cookingMethod: cookingMethod || null,
        image,
        imagePublicId,
        ingredients: { create: ingredientRelations },
      },
    });

    console.log("🍕 Pizza created:", pizza.id);

    await recomputeMenuPizzaStatus(prisma, pizza.id);
    await zeroStockForNewPizza(prisma, pizza.id);

    console.log("✅ POST /api/pizzas DONE");
    res.json(pizza);

  } catch (err) {
    console.error("🔥 POST /api/pizzas FATAL ERROR:", err);
    res.status(400).json({ error: err.message });
  }
});


  /* PUT /api/pizzas/:id */
  router.put("/:id", upload.single("image"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid id" });

      const existing = await prisma.menuPizza.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "Pizza not found" });

      let parsedSizes = [];
      let parsedPrices = {};
      let parsedIngredients = [];

      try {
        parsedSizes = req.body.sizes ? JSON.parse(req.body.sizes) : [];
        parsedPrices = req.body.priceBySize ? JSON.parse(req.body.priceBySize) : {};
        parsedIngredients = req.body.ingredients ? JSON.parse(req.body.ingredients) : [];
      } catch (e) {
        console.error("JSON parse error:", req.body);
        return res.status(400).json({ error: "Invalid JSON payload" });
      }

      let image = existing.image;
      let imagePublicId = existing.imagePublicId;

      if (req.file) {
        if (existing.imagePublicId) {
          await cloudinary.uploader.destroy(existing.imagePublicId);
        }

  const uploadRes = await new Promise((resolve, reject) => {
  cloudinary.uploader.upload_stream(
    { folder: "pizzas" },
    (error, result) => {
      if (error) return reject(error);
      resolve(result);
    }
  ).end(req.file.buffer);
});

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
      console.error("PUT /pizzas error:", err);
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
      console.error("DELETE /pizzas error:", err);
      res.status(400).json({ error: err.message });
    }
  });

  return router;
};
