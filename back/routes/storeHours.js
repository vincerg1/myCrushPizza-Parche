const express = require("express");

module.exports = function (prisma) {

  const r = express.Router();

  /* ───────── GET HOURS BY STORE ───────── */
  r.get("/:storeId", async (req, res) => {
    try {

      const storeId = Number(req.params.storeId);

      const rows = await prisma.storeHours.findMany({
        where: { storeId },
        orderBy: [
          { dayOfWeek: "asc" },
          { openTime: "asc" }
        ]
      });

      res.json(rows);

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to load hours" });
    }
  });

  /* ───────── CREATE SLOT ───────── */
  r.post("/", async (req, res) => {

    try {

      const {
        storeId,
        dayOfWeek,
        openTime,
        closeTime
      } = req.body;

      const row = await prisma.storeHours.create({
        data: {
          storeId: Number(storeId),
          dayOfWeek: Number(dayOfWeek),
          openTime: Number(openTime),
          closeTime: Number(closeTime)
        }
      });

      res.json(row);

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to create slot" });
    }
  });

  /* ───────── UPDATE SLOT ───────── */
  r.patch("/:id", async (req, res) => {

    try {

      const id = Number(req.params.id);

      const data = {};

      if (req.body.openTime !== undefined)
        data.openTime = Number(req.body.openTime);

      if (req.body.closeTime !== undefined)
        data.closeTime = Number(req.body.closeTime);

      const row = await prisma.storeHours.update({
        where: { id },
        data
      });

      res.json(row);

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update slot" });
    }
  });

  /* ───────── DELETE SLOT ───────── */
  r.delete("/:id", async (req, res) => {

    try {

      const id = Number(req.params.id);

      await prisma.storeHours.delete({
        where: { id }
      });

      res.json({ success: true });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete slot" });
    }
  });

  return r;
};