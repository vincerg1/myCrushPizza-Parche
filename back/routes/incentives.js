// routes/incentives.js
const express = require("express");

module.exports = function (prisma) {
  const r = express.Router();

  /* ───────────────────────── HELPERS ───────────────────────── */

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

  const cleanDays = (arr) => {
    if (!Array.isArray(arr)) return null;
    const cleaned = arr
      .map(Number)
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    return cleaned.length ? cleaned : null;
  };

  const isInWindow = (minutesNow, start, end) => {
    if (start == null || end == null) return true;

    return start <= end
      ? minutesNow >= start && minutesNow < end
      : minutesNow >= start || minutesNow < end; // cruza medianoche
  };

  /* ───────────────────────── GET ALL ───────────────────────── */

  r.get("/", async (_req, res) => {
    try {
      const incentives = await prisma.incentive.findMany({
        orderBy: { createdAt: "desc" },
      });
      res.json(incentives);
    } catch (err) {
      console.error("GET incentives error:", err);
      res.status(500).json({ error: "Error fetching incentives" });
    }
  });

  /* ───────────────────────── GET ACTIVE (TIME-DRIVEN) ───────────────────────── */

  r.get("/active/one", async (_req, res) => {
    try {
      const TZ = process.env.TIMEZONE || "Europe/Madrid";

      const nowStr = new Date().toLocaleString("sv-SE", { timeZone: TZ });
      const now = new Date(nowStr.replace(" ", "T"));

      const minutesNow = now.getHours() * 60 + now.getMinutes();
      const dayNow = now.getDay();

      const incentives = await prisma.incentive.findMany({
        where: {
          active: true, // enabled
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: { createdAt: "desc" }, // el más reciente tiene prioridad
      });

      for (const inc of incentives) {
        if (inc.daysActive?.length && !inc.daysActive.includes(dayNow)) {
          continue;
        }

        if (!isInWindow(minutesNow, inc.windowStart, inc.windowEnd)) {
          continue;
        }

        return res.json(inc);
      }

      return res.json(null);
    } catch (err) {
      console.error("GET active incentive error:", err);
      res.status(500).json({ error: "Error fetching active incentive" });
    }
  });

  /* ───────────────────────── CREATE ───────────────────────── */

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
        daysActive,
        windowStart,
        windowEnd,
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

      if (
        (windowStart != null && windowEnd == null) ||
        (windowStart == null && windowEnd != null)
      ) {
        return res.status(400).json({
          error: "windowStart and windowEnd must both be defined or both null",
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
          active: !!active, // solo enabled/disabled
          startsAt: asDateOrNull(startsAt),
          endsAt: asDateOrNull(endsAt),
          daysActive: cleanDays(daysActive),
          windowStart: asNumberOrNull(windowStart),
          windowEnd: asNumberOrNull(windowEnd),
        },
      });

      res.json(created);
    } catch (err) {
      console.error("POST incentive error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ───────────────────────── UPDATE ───────────────────────── */

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
        daysActive,
        windowStart,
        windowEnd,
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

      if (active != null) data.active = !!active;

      if (startsAt !== undefined) data.startsAt = asDateOrNull(startsAt);
      if (endsAt !== undefined) data.endsAt = asDateOrNull(endsAt);

      if (daysActive !== undefined) {
        data.daysActive = cleanDays(daysActive);
      }

      if (
        (windowStart != null && windowEnd == null) ||
        (windowStart == null && windowEnd != null)
      ) {
        return res.status(400).json({
          error: "windowStart and windowEnd must both be defined or both null",
        });
      }

      if (windowStart !== undefined) {
        data.windowStart = asNumberOrNull(windowStart);
      }

      if (windowEnd !== undefined) {
        data.windowEnd = asNumberOrNull(windowEnd);
      }

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
      console.error("PATCH incentive error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  /* ───────────────────────── DELETE ───────────────────────── */

  r.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid id" });
      }

      await prisma.incentive.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE incentive error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return r;
};