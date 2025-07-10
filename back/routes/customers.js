/* eslint-disable consistent-return */
const express = require("express");
const axios   = require("axios");
const router  = express.Router();
const GOOGLE  = process.env.GOOGLE_GEOCODING_KEY;

module.exports = (prisma) => {

  /* helper: CUS-##### único -------------------------------------- */
  async function genCustomerCode() {
    let code;
    do {
      code = "CUS-" + Math.floor(10000 + Math.random() * 90000);
    } while (await prisma.customer.findUnique({ where: { code } }));
    return code;
  }

  /* ────────────────────────────────────────────────────────────────
   * 1)  GET /api/customers
   *     → lista compacta para el mapa  (id, name, lat, lng, lastSale)
   * ---------------------------------------------------------------- */
router.get("/", async (_, res) => {
  try {
    const list = await prisma.customer.findMany({
      select: {
        id      : true,
        name    : true,
        lat     : true,
        lng     : true,
        daysOff : true              //  ← ya calculado
      },
      orderBy: { updatedAt: "desc" }
    });
    res.json(list);
  } catch (err) {
    console.error("[CUSTOMERS/] error:", err);
    res.status(500).json({ error: "internal" });
  }
});


  /* ────────────────────────────────────────────────────────────────
   * 2)  GET /api/customers/search?q=…
   *     → por teléfono (dígitos) o address_1 (texto)
   * ---------------------------------------------------------------- */
  router.get("/search", async (req, res) => {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);

    const digits = q.replace(/\D/g, "");
    const text   = q.toUpperCase();

    try {
      const found = await prisma.customer.findMany({
        where:{
          OR:[
            digits ? { phone:     { contains:digits } } : undefined,
            { address_1:{ contains:text } }
          ].filter(Boolean)
        },
        take:5,
        orderBy:{ updatedAt:"desc" }
      });
      console.log("[SEARCH]", q, `→ ${found.length} hit(s)`);
      res.json(found);
    } catch (err) {
      console.error("[CUSTOMERS/search] error:", err);
      res.status(500).json({ error:"internal" });
    }
  });

  /* ────────────────────────────────────────────────────────────────
   * 3)  POST /api/customers
   *     → upsert por address_1, geocoding si faltan coords
   * ---------------------------------------------------------------- */
  router.post("/", async (req, res) => {
    try {
      const {
        name, phone,
        address_1, portal, observations,
        lat, lng
      } = req.body;

      if (!address_1)
        return res.status(400).json({ error:"address_1 requerido" });

      /* ① coords: si faltan ⇒ geocode */
      let geo = { lat:+lat || null, lng:+lng || null };
      if (!geo.lat || !geo.lng) {
        const { data:g } = await axios.get(
          "https://maps.googleapis.com/maps/api/geocode/json",
          { params:{ address:address_1, components:"country:ES", key:GOOGLE } }
        );
        if (!g.results?.length)
          return res.status(400).json({ error:"Dirección no encontrada" });
        geo = g.results[0].geometry.location;
      }

      /* ② upsert por address_1 (UNIQUE) */
      const saved = await prisma.customer.upsert({
        where : { address_1 },
        update: { name, phone, portal, observations, ...geo },
        create: {
          code: await genCustomerCode(),
          name, phone, address_1, portal, observations, ...geo
        }
      });

      res.json(saved);
    } catch (err) {
      console.error("[CUSTOMERS/post]", err);
      res.status(500).json({ error:"internal" });
    }
  });
/* ────────────────────────────────────────────────────────────────
 * 4)  DELETE /api/customers/:id
 *     → elimina cliente por ID
 * ---------------------------------------------------------------- */
router.delete("/:id", async (req, res) => {
  const id = +req.params.id;
  if (!id) return res.status(400).json({ error: "Invalid ID" });

  try {
    await prisma.customer.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("[CUSTOMERS/delete]", err);
    res.status(500).json({ error: "internal" });
  }
});
  return router;
};
