// routes/public.js
const router = require("express").Router();

module.exports = (prisma) => {
  //  GET /api/public/customer/:code
  router.get("/customer/:code", async (req, res) => {
    const code = req.params.code;
    try {
      const sale = await prisma.sale.findUnique({
        where: { code },                       // ORD-26736
        include: { customer: true }
      });
      if (!sale) return res.status(404).json({ error: "not found" });

      const c = sale.customer || {};
      res.json({
        orderCode: sale.code,
        name : c.name  || "",
        phone: c.phone || "",
        addr : c.address_1 || "",
        lat  : c.lat,
        lng  : c.lng
      });
    } catch (e) { res.status(500).json({ error: "internal" }); }
  });

  return router;
};
