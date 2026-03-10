const express = require("express");

module.exports = (prisma) => {

  const router = express.Router();

  /* ───────── CREATE RESERVATION ───────── */

  router.post("/", async (req, res) => {

    try {

      const {
        storeId,
        customerName,
        customerPhone,
        partySize,
        reservationDate,
        reservationTime
      } = req.body;

      if (!storeId || !customerName || !partySize || !reservationDate || !reservationTime) {
        return res.status(400).json({ error: "missing fields" });
      }

      const reservationDateTime = new Date(`${reservationDate}T${reservationTime}`);

      const reservation = await prisma.reservation.create({
        data:{
          storeId: Number(storeId),
          customerName,
          customerPhone,
          partySize: Number(partySize),
          reservationDate: new Date(reservationDate),
          reservationTime,
          reservationDateTime
        }
      });

      res.json(reservation);

    } catch(err){
      console.error("[POST /reservations]", err);
      res.status(500).json({ error:"internal error" });
    }

  });

  /* ───────── AVAILABILITY ───────── */

  router.get("/availability", async (req, res) => {

    try {

      const storeId = Number(req.query.storeId);
      const date = req.query.date;

      if (!storeId || !date) {
        return res.status(400).json({ error:"storeId and date required" });
      }

      const store = await prisma.store.findUnique({
        where:{ id:storeId }
      });

      if (!store) {
        return res.status(404).json({ error:"store not found" });
      }

      const reservations = await prisma.reservation.findMany({
        where:{
          storeId,
          reservationDate:new Date(date),
          status:"pending"
        }
      });

      const capacity = store.reservationCapacity || 0;

      const slots = {};

      reservations.forEach(r => {

        if (!slots[r.reservationTime]) {
          slots[r.reservationTime] = 0;
        }

        slots[r.reservationTime] += r.partySize;

      });

      const availability = Object.keys(slots).map(time => ({
        time,
        occupied: slots[time],
        available: capacity - slots[time]
      }));

      res.json({
        capacity,
        availability
      });

    } catch(err){
      console.error("[GET /reservations/availability]", err);
      res.status(500).json({ error:"internal error" });
    }

  });

  /* ───────── STORE RESERVATIONS ───────── */

  router.get("/store/:storeId", async (req, res) => {

    try {

      const storeId = Number(req.params.storeId);

      const reservations = await prisma.reservation.findMany({
        where:{ storeId },
        orderBy:{ reservationDateTime:"asc" }
      });

      res.json(reservations);

    } catch(err){
      console.error("[GET /reservations/store]", err);
      res.status(500).json({ error:"internal error" });
    }

  });

  /* ───────── CANCEL RESERVATION ───────── */

  router.patch("/:id/cancel", async (req, res) => {

    try {

      const id = Number(req.params.id);

      const updated = await prisma.reservation.update({
        where:{ id },
        data:{ status:"cancelled" }
      });

      res.json(updated);

    } catch(err){
      console.error("[PATCH /reservations/cancel]", err);
      res.status(500).json({ error:"internal error" });
    }

  });

  return router;

};