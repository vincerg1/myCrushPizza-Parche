/* eslint-disable consistent-return */
const express = require("express");
const router = express.Router();

module.exports = (prisma) => {


  router.post("/register", async (req, res) => {
    const { code, storeId, name } = req.body;

    if (!code || !storeId) {
      return res.status(400).json({ error: "missing_fields" });
    }

    let pos = await prisma.pOS.findUnique({ where: { code } });

    if (!pos) {
      pos = await prisma.pOS.create({
        data: { code, storeId, name },
      });
    } else {
      pos = await prisma.pOS.update({
        where: { id: pos.id },
        data: { lastSeenAt: new Date() },
      });
    }

    res.json({ ok: true, posId: pos.id });
  });

  router.get("/jobs/:posId", async (req, res) => {
    const posId = Number(req.params.posId);
    if (!Number.isInteger(posId)) {
      return res.status(400).json({ error: "invalid_pos_id" });
    }

    const job = await prisma.pOSJob.findFirst({
      where: {
        posId,
        status: "PENDING",
      },
      orderBy: { createdAt: "asc" },
    });

    if (!job) {
      return res.json({ job: null });
    }

    // marcar como PROCESSING
    await prisma.pOSJob.update({
      where: { id: job.id },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
      },
    });

    res.json({ job });
  });

  router.post("/jobs/:jobId/ack", async (req, res) => {
    const jobId = Number(req.params.jobId);
    const { ok, error } = req.body;

    if (!Number.isInteger(jobId)) {
      return res.status(400).json({ error: "invalid_job_id" });
    }

    const job = await prisma.pOSJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ error: "job_not_found" });
    }

    await prisma.pOSJob.update({
      where: { id: jobId },
      data: {
        status: ok ? "PRINTED" : "FAILED",
        error: ok ? null : error || "unknown_error",
        processedAt: new Date(),
      },
    });

    res.json({ ok: true });
  });

  return router;
};
