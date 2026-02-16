// routes/basesPizzas.js
const express = require("express");

module.exports = function (prisma) {
  const r = express.Router();

  r.get("/", async (req, res) => {
    try {
      const rows = await prisma.menuPizza.findMany({
        where: {
          status: "ACTIVE",
          name: {
            startsWith: "Base"
          }
        },
        select: {
          id: true,
          name: true,
          category: true,
          selectSize: true,
          priceBySize: true,
          image: true,
        },
        orderBy: { id: "asc" }
      });

      res.json(rows.map(row => ({
        pizzaId: row.id,
        name: row.name,
        category: row.category,
        selectSize: row.selectSize ?? [],
        priceBySize: row.priceBySize ?? {},
        image: row.image ?? null
      })));

    } catch (err) {
      console.error("🔥 basesPizzas error:", err);
      res.status(500).json([]);
    }
  });

  return r;
};
