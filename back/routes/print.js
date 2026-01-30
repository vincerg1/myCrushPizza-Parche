/* eslint-disable consistent-return */
const express = require("express");
const router = express.Router();

/*
  Este módulo gestiona trabajos de impresión (PRINT_TICKET)
  bajo el modelo POS → polling → ACK.
*/

module.exports = (prisma) => {

  // ─────────────────────────────────────────────
  // POST /api/print/print-ticket
  // Crea un trabajo PRINT_TICKET para un POS
  // ─────────────────────────────────────────────
  router.post("/print-ticket", async (req, res) => {
    try {
      const { storeId, payload } = req.body;

      if (!storeId || !payload) {
        return res.status(400).json({ error: "missing_store_or_payload" });
      }

      // Buscar POS activo para la tienda
      const pos = await prisma.pos.findFirst({
        where: {
          storeId,
          isActive: true,
        },
      });

      if (!pos) {
        return res.status(404).json({ error: "pos_not_found" });
      }

      // Crear trabajo en cola
      const job = await prisma.posJob.create({
        data: {
          posId: pos.id,
          type: "PRINT_TICKET",
          status: "PENDING",
          payload,
        },
      });

      // 202 = aceptado pero no procesado aún
      res.status(202).json({
        ok: true,
        jobId: job.id,
      });

    } catch (err) {
      console.error("[PRINT/print-ticket]", err);
      res.status(500).json({ error: "internal" });
    }
  });

  // ─────────────────────────────────────────────
  // GET /api/print/jobs
  // El POS hace polling para recoger trabajos
  // ─────────────────────────────────────────────
  router.get("/jobs", async (req, res) => {
    try {
      const { posCode } = req.query;

      if (!posCode) {
        return res.status(400).json({ error: "missing_posCode" });
      }

      const pos = await prisma.pos.findUnique({
        where: { code: posCode },
      });

      if (!pos) {
        return res.status(404).json({ error: "pos_not_found" });
      }

      const jobs = await prisma.posJob.findMany({
        where: {
          posId: pos.id,
          status: "PENDING",
        },
        orderBy: { createdAt: "asc" },
        take: 5, // evitamos inundar al POS
      });

      res.json({ jobs });

    } catch (err) {
      console.error("[PRINT/jobs]", err);
      res.status(500).json({ error: "internal" });
    }
  });

  // ─────────────────────────────────────────────
  // PATCH /api/print/jobs/:id/ack
  // El POS confirma que el ticket fue impreso
  // ─────────────────────────────────────────────
  router.patch("/jobs/:id/ack", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "invalid_id" });
    }

    try {
      const updated = await prisma.posJob.update({
        where: { id },
        data: {
          status: "DONE",
          ackAt: new Date(),
        },
      });

      res.json({ ok: true, job: updated });

    } catch (err) {
      console.error("[PRINT/jobs/ack]", err);
      res.status(500).json({ error: "internal" });
    }
  });

  // ─────────────────────────────────────────────
  // PATCH /api/print/jobs/:id/fail
  // El POS informa que falló la impresión
  // ─────────────────────────────────────────────
  router.patch("/jobs/:id/fail", async (req, res) => {
    const id = Number(req.params.id);
    const { reason } = req.body;

    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "invalid_id" });
    }

    try {
      const updated = await prisma.posJob.update({
        where: { id },
        data: {
          status: "FAILED",
          error: reason || "unknown_error",
          ackAt: new Date(),
        },
      });

      res.json({ ok: true, job: updated });

    } catch (err) {
      console.error("[PRINT/jobs/fail]", err);
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
};
