// routes/incentives.js

const express = require("express");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const router = express.Router();

/* =========================================================
   GET ALL INCENTIVES
   ========================================================= */
router.get("/", async (req, res) => {
  try {
    const incentives = await prisma.incentive.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        rewardPizza: true
      }
    });

    res.json(incentives);
  } catch (err) {
    console.error("GET incentives error:", err);
    res.status(500).json({ error: "Error fetching incentives" });
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
      endsAt
    } = req.body;

    if (!name || !triggerMode || !rewardPizzaId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Si viene activo = true → desactivar todos antes
    if (active) {
      await prisma.incentive.updateMany({
        where: { active: true },
        data: { active: false }
      });
    }

    const incentive = await prisma.incentive.create({
      data: {
        name,
        triggerMode,
        fixedAmount: fixedAmount ?? null,
        percentOverAvg: percentOverAvg ?? null,
        rewardPizzaId: Number(rewardPizzaId),
        active: !!active,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null
      }
    });

    res.json(incentive);

  } catch (err) {
    console.error("CREATE incentive error:", err);
    res.status(500).json({ error: "Error creating incentive" });
  }
});


/* =========================================================
   UPDATE INCENTIVE
   ========================================================= */
router.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const {
      name,
      triggerMode,
      fixedAmount,
      percentOverAvg,
      rewardPizzaId,
      active,
      startsAt,
      endsAt
    } = req.body;

    // Si lo activan → desactivar otros
    if (active) {
      await prisma.incentive.updateMany({
        where: {
          active: true,
          NOT: { id }
        },
        data: { active: false }
      });
    }

    const incentive = await prisma.incentive.update({
      where: { id },
      data: {
        name,
        triggerMode,
        fixedAmount: fixedAmount ?? null,
        percentOverAvg: percentOverAvg ?? null,
        rewardPizzaId: rewardPizzaId ? Number(rewardPizzaId) : undefined,
        active: active ?? undefined,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null
      }
    });

    res.json(incentive);

  } catch (err) {
    console.error("UPDATE incentive error:", err);
    res.status(500).json({ error: "Error updating incentive" });
  }
});


/* =========================================================
   ACTIVATE INCENTIVE (UNIQUE ACTIVE)
   ========================================================= */
router.patch("/:id/activate", async (req, res) => {
  try {
    const id = Number(req.params.id);

    // Desactivar todos
    await prisma.incentive.updateMany({
      where: { active: true },
      data: { active: false }
    });

    // Activar este
    const incentive = await prisma.incentive.update({
      where: { id },
      data: { active: true }
    });

    res.json(incentive);

  } catch (err) {
    console.error("ACTIVATE incentive error:", err);
    res.status(500).json({ error: "Error activating incentive" });
  }
});


/* =========================================================
   GET ACTIVE INCENTIVE (PARA LSF)
   ========================================================= */
router.get("/active/one", async (req, res) => {
  try {
    const now = new Date();

    const incentive = await prisma.incentive.findFirst({
      where: {
        active: true,
        OR: [
          { startsAt: null },
          { startsAt: { lte: now } }
        ],
        AND: [
          {
            OR: [
              { endsAt: null },
              { endsAt: { gte: now } }
            ]
          }
        ]
      },
      include: {
        rewardPizza: true
      }
    });

    res.json(incentive || null);

  } catch (err) {
    console.error("GET active incentive error:", err);
    res.status(500).json({ error: "Error fetching active incentive" });
  }
});

module.exports = router;