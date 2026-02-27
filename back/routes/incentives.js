// routes/incentives.js
const express = require("express");

module.exports = function (prisma) {
  const r  = express.Router();

  /* ─────────────────────────────────────────────
     Helpers
  ───────────────────────────────────────────── */
  const asNumberOrNull = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const asDateOrNull = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

r.get("/ping", (_req, res) => {
  res.json({ ok: true, t: Date.now() });
});

  /* =========================================================
     GET ALL INCENTIVES
  ========================================================= */
  r.get("/", async (_req, res) => {
    try {
      const incentives = await prisma.incentive.findMany({
        orderBy: { createdAt: "desc" },
      });

      res.json(incentives);
    } catch (err) {
      console.error("GET /api/incentives error:", err);
      res.status(500).json({ error: "Error fetching incentives" });
    }
  });

  /* =========================================================
     GET ACTIVE INCENTIVE
  ========================================================= */
  r.get("/active/one", async (_req, res) => {
    try {
      const now = new Date();

      const incentive = await prisma.incentive.findFirst({
        where: {
          active: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
      });

      res.json(incentive || null);
    } catch (err) {
      console.error("GET /api/incentives/active/one error:", err);
      res.status(500).json({ error: "Error fetching active incentive" });
    }
  });

  /* =========================================================
     CREATE INCENTIVE
  ========================================================= */
  r.post("/", async (req, res) => {
    try {
      const {
        name,
        triggerMode,
        fixedAmount,
        percentOverAvg,
        rewardPizzaId,
        active,
        startsAt,
        endsAt,
      } = req.body || {};

      if (!name || !triggerMode || !rewardPizzaId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (!["FIXED", "SMART_AVG_TICKET"].includes(triggerMode)) {
        return res.status(400).json({ error: "Invalid triggerMode" });
      }

      const rewardId = Number(rewardPizzaId);
      if (!Number.isFinite(rewardId) || rewardId <= 0) {
        return res.status(400).json({ error: "Invalid rewardPizzaId" });
      }

      if (triggerMode === "FIXED") {
        const fa = asNumberOrNull(fixedAmount);
        if (fa === null || fa <= 0) {
          return res.status(400).json({ error: "Invalid fixedAmount" });
        }
      }

      if (triggerMode === "SMART_AVG_TICKET") {
        const p = asNumberOrNull(percentOverAvg);
        if (p === null || p <= 0) {
          return res.status(400).json({ error: "Invalid percentOverAvg" });
        }
      }

      // Si viene active=true → desactivar otros
      if (active === true) {
        await prisma.incentive.updateMany({
          where: { active: true },
          data: { active: false },
        });
      }

      const created = await prisma.incentive.create({
        data: {
          name: String(name).trim(),
          triggerMode,
          fixedAmount:
            triggerMode === "FIXED" ? asNumberOrNull(fixedAmount) : null,
          percentOverAvg:
            triggerMode === "SMART_AVG_TICKET"
              ? asNumberOrNull(percentOverAvg)
              : null,
          rewardPizzaId: rewardId,
          active: !!active,
          startsAt: asDateOrNull(startsAt),
          endsAt: asDateOrNull(endsAt),
        },
      });

      res.json(created);
    } catch (err) {
      console.error("POST /api/incentives error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* =========================================================
     UPDATE INCENTIVE
  ========================================================= */
  r.patch("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid id" });
      }

      const {
        name,
        triggerMode,
        fixedAmount,
        percentOverAvg,
        rewardPizzaId,
        active,
        startsAt,
        endsAt,
      } = req.body || {};

      const data = {};

      if (name != null) data.name = String(name).trim();
      if (triggerMode != null) data.triggerMode = triggerMode;

      if (rewardPizzaId != null) {
        const rewardId = Number(rewardPizzaId);
        if (!Number.isFinite(rewardId) || rewardId <= 0) {
          return res.status(400).json({ error: "Invalid rewardPizzaId" });
        }
        data.rewardPizzaId = rewardId;
      }

      if (active === true) {
        await prisma.incentive.updateMany({
          where: { active: true, NOT: { id } },
          data: { active: false },
        });
      }

      if (active != null) data.active = !!active;

      if (startsAt !== undefined) data.startsAt = asDateOrNull(startsAt);
      if (endsAt !== undefined) data.endsAt = asDateOrNull(endsAt);

      if (triggerMode === "FIXED") {
        data.fixedAmount = asNumberOrNull(fixedAmount);
        data.percentOverAvg = null;
      }

      if (triggerMode === "SMART_AVG_TICKET") {
        data.percentOverAvg = asNumberOrNull(percentOverAvg);
        data.fixedAmount = null;
      }

      const updated = await prisma.incentive.update({
        where: { id },
        data,
      });

      res.json(updated);
    } catch (err) {
      console.error("PATCH /api/incentives/:id error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* =========================================================
     ACTIVATE INCENTIVE
  ========================================================= */
  r.patch("/:id/activate", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid id" });
      }

      await prisma.incentive.updateMany({
        where: { active: true },
        data: { active: false },
      });

      const activated = await prisma.incentive.update({
        where: { id },
        data: { active: true },
      });

      res.json(activated);
    } catch (err) {
      console.error("PATCH /api/incentives/:id/activate error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  
  /* =========================================================
   DELETE INCENTIVE
========================================================= */
r.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    await prisma.incentive.delete({
      where: { id },
    });

    res.json({ ok: true, id });
  } catch (err) {
    console.error("DELETE /api/incentives/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

  return r;
};