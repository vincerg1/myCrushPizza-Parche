// routes/incentives.js
const express = require("express");

module.exports = function (prisma) {
  const router = express.Router();

  // helpers
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

  /* =========================================================
     GET ALL INCENTIVES
     ========================================================= */
  router.get("/", async (_req, res) => {
    try {
      const incentives = await prisma.incentive.findMany({
        orderBy: { createdAt: "desc" },
        include: { rewardPizza: true },
      });
      res.json(incentives);
    } catch (err) {
      console.error("GET /api/incentives error:", err);
      res.status(500).json({ error: "Error fetching incentives" });
    }
  });

  /* =========================================================
     GET ACTIVE INCENTIVE (PARA LSF)
     ========================================================= */
  router.get("/active/one", async (_req, res) => {
    try {
      const now = new Date();

      const incentive = await prisma.incentive.findFirst({
        where: {
          active: true,
          AND: [
            {
              OR: [{ startsAt: null }, { startsAt: { lte: now } }],
            },
            {
              OR: [{ endsAt: null }, { endsAt: { gte: now } }],
            },
          ],
        },
        include: { rewardPizza: true },
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
  router.post("/", async (req, res) => {
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

      // Validación por modo
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

      // Si viene activo=true -> desactivar otros
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
        include: { rewardPizza: true },
      });

      res.json(created);
    } catch (err) {
      console.error("POST /api/incentives error:", err);
      res.status(500).json({ error: "Error creating incentive" });
    }
  });

  /* =========================================================
     UPDATE INCENTIVE
     ========================================================= */
  router.patch("/:id", async (req, res) => {
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

      if (triggerMode && !["FIXED", "SMART_AVG_TICKET"].includes(triggerMode)) {
        return res.status(400).json({ error: "Invalid triggerMode" });
      }

      // Si lo activan -> desactivar otros
      if (active === true) {
        await prisma.incentive.updateMany({
          where: { active: true, NOT: { id } },
          data: { active: false },
        });
      }

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

      if (active != null) data.active = !!active;

      // fechas: si viene "" => null
      if (startsAt !== undefined) data.startsAt = asDateOrNull(startsAt);
      if (endsAt !== undefined) data.endsAt = asDateOrNull(endsAt);

      // Importante: si cambian triggerMode, limpiamos lo otro.
      const mode = triggerMode;

      if (mode === "FIXED") {
        const fa = asNumberOrNull(fixedAmount);
        if (fa === null || fa <= 0) {
          return res.status(400).json({ error: "Invalid fixedAmount" });
        }
        data.fixedAmount = fa;
        data.percentOverAvg = null;
      } else if (mode === "SMART_AVG_TICKET") {
        const p = asNumberOrNull(percentOverAvg);
        if (p === null || p <= 0) {
          return res.status(400).json({ error: "Invalid percentOverAvg" });
        }
        data.percentOverAvg = p;
        data.fixedAmount = null;
      } else {
        // si no cambia mode, pero envían valores:
        if (fixedAmount !== undefined) data.fixedAmount = asNumberOrNull(fixedAmount);
        if (percentOverAvg !== undefined) data.percentOverAvg = asNumberOrNull(percentOverAvg);
      }

      const updated = await prisma.incentive.update({
        where: { id },
        data,
        include: { rewardPizza: true },
      });

      res.json(updated);
    } catch (err) {
      console.error("PATCH /api/incentives/:id error:", err);
      res.status(500).json({ error: "Error updating incentive" });
    }
  });

  /* =========================================================
     ACTIVATE INCENTIVE (UNIQUE ACTIVE)
     ========================================================= */
  router.patch("/:id/activate", async (req, res) => {
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
        include: { rewardPizza: true },
      });

      res.json(activated);
    } catch (err) {
      console.error("PATCH /api/incentives/:id/activate error:", err);
      res.status(500).json({ error: "Error activating incentive" });
    }
  });

  return router;
};