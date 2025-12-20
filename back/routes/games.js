// routes/games.js
const express = require("express");

module.exports = (prisma) => {
  const router = express.Router();

  // (opcional pero recomendado) proteger con x-api-key como en coupons
  router.get("/", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"];
      if (process.env.SALES_API_KEY && apiKey !== process.env.SALES_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const onlyActive = String(req.query.active ?? "true") === "true";

      const games = await prisma.game.findMany({
        where: onlyActive ? { active: true } : {},
        orderBy: { id: "asc" },
        select: { id: true, name: true, slug: true, active: true },
      });

      res.json({ items: games });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Error al obtener games" });
    }
  });

  return router;
};
