// routes/stores.js
const express = require("express");
const { zeroStockForNewStore } = require("../utils/stockSync");
const auth = require("../middleware/auth");            // ← IMPORTA auth
const router = express.Router();

module.exports = (prisma) => {
  /* ───────── activate ───────── */
  router.patch("/:id/active", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ error: "id must be number" });

    const { active } = req.body;
    if (typeof active !== "boolean")
      return res.status(400).json({ error: "body.active boolean required" });

    try {
      const updated = await prisma.store.update({
        where: { id },
        data : { active }
      });
      res.json({ ok: true, active: updated.active });
    } catch (err) {
      console.error("[PATCH /stores/:id/active]", err);
      res.status(400).json({ error: err.message });
    }
  });

  /* ───────── TIENDA MÁS CERCANA ───────── */
  router.get("/nearest", async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: "coords requeridas" });
    }

    try {
      // SOLO stores activas
      const all = await prisma.store.findMany({
        where: { active: true }
      });

      const R = 6371;
      const rad = (d) => (d * Math.PI) / 180;
      const hav = (a, b) => {
        const dLat = rad(b.lat - a.lat);
        const dLng = rad(b.lng - a.lng);
        const h =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(rad(a.lat)) *
            Math.cos(rad(b.lat)) *
            Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
      };

      let best = null;
      all.forEach((s) => {
        if (s.latitude == null || s.longitude == null) return;
        const d = hav({ lat, lng }, { lat: s.latitude, lng: s.longitude });
        if (!best || d < best.d) best = { store: s, d };
      });

      return best
        ? res.json({
            storeId     : best.store.id,
            storeName   : best.store.storeName,
            distanciaKm : +best.d.toFixed(2),
          })
        : res.status(404).json({ error: "no stores with coords" });
    } catch (err) {
      console.error("nearest store error:", err);
      res.status(500).json({ error: "internal" });
    }
  });

  /* ───────── GET store BY ID ───────── */
  router.get("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "id must be number" });
    }
    try {
      const store = await prisma.store.findUnique({ where: { id } });
      store
        ? res.json(store)
        : res.status(404).json({ error: "not found" });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  /* ───────── LIST ───────── */
  router.get("/", async (_, res) => {
    try {
      const stores = await prisma.store.findMany({ orderBy: { id: "desc" } });
      res.json(stores);
    } catch (err) {
      res.status(500).json({ error: "Error fetching stores" });
    }
  });

/* ───────── CREATE ───────── */
router.post("/", async (req, res) => {
  try {
    const {
      storeName,
      address,
      latitude,
      longitude,
      city,
      zipCode,
      email,
      tlf,
    } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      // 1️⃣ Crear tienda
      const store = await tx.store.create({
        data: {
          storeName,
          address,
          city,
          zipCode,
          email,
          tlf,
          latitude: latitude !== "" ? +latitude : null,
          longitude: longitude !== "" ? +longitude : null,
        },
      });

      // 2️⃣ Inicializar pizzas (ya lo hacías)
      await zeroStockForNewStore(tx, store.id);

      // 3️⃣ 🔥 Inicializar ingredientes (LO QUE FALTABA)
      const ingredients = await tx.ingredient.findMany({
        select: { id: true },
      });

      if (ingredients.length) {
        await tx.storeIngredientStock.createMany({
          data: ingredients.map((ing) => ({
            storeId: store.id,
            ingredientId: ing.id,
            stock: 0,
            active: true,
          })),
        });
      }

      return store;
    });

    res.json(result);
  } catch (err) {
    console.error("[POST /stores]", err);
    res.status(400).json({ error: err.message });
  }
});


  /* ───────── DELETE ───────── */
  router.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "id must be number" });
    }

    try {
      await prisma.$transaction(async (tx) => {
        // 1) stocks
        await tx.storePizzaStock.deleteMany({ where: { storeId: id } });
        // 2) ventas (opcional: comenta si quieres conservarlas)
        await tx.sale.deleteMany({ where: { storeId: id } });
        // 3) la tienda
        await tx.store.delete({ where: { id } });
      });

      res.json({ ok: true, id });
    } catch (err) {
      console.error("[DELETE /stores]", err);
      res.status(400).json({ error: err.meta?.cause || err.message });
    }
  });


const storeIngredients = require("./storeIngredients")(prisma);
router.use("/:storeId/ingredients", storeIngredients);
  return router;
};
