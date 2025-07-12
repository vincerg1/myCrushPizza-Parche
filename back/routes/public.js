// routes/public.js
const router = require("express").Router();

module.exports = prisma => {
  /* ─────────────  GET /api/public/customer/:code  ───────────── */
  router.get("/customer/:code", async (req, res) => {
    const code = req.params.code;            // p. ej. ORD-36930
    try {
      const sale = await prisma.sale.findUnique({
        where  : { code },
        include: { customer: true }
      });

      if (!sale) return res.status(404).json({ error: "not found" });

      const c = sale.customer || {};
      /*  ⬇︎ añadimos date y deliveredAt  */
      res.json({
        orderCode   : sale.code,
        date        : sale.date,          // ← para el cronómetro
        deliveredAt : sale.deliveredAt,   // ← para mostrar “Finalized 👍”
        name  : c.name       || "",
        phone : c.phone      || "",
        addr  : c.address_1  || "",
        lat   : c.lat,
        lng   : c.lng
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "internal" });
    }
  });

  /* ──────────  PATCH /api/public/customer/:code/delivered  ────────── */
  router.patch("/customer/:code/delivered", async (req, res) => {
    const code = req.params.code;
    try {
      const sale = await prisma.sale.update({
        where : { code },
        data  : { deliveredAt: new Date() },
        select: { deliveredAt: true }
      });
      res.json(sale);                       // { deliveredAt: "2025-07-12T14:55:22.123Z" }
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
};
