/* eslint-disable consistent-return */
const express = require("express");
const axios   = require("axios");
const router  = express.Router();
const GOOGLE  = process.env.GOOGLE_GEOCODING_KEY;

module.exports = (prisma) => {

  // ── helper CUS-#####
  async function genCustomerCode() {
    let code;
    do {
      code = "CUS-" + Math.floor(10000 + Math.random() * 90000);
    } while (await prisma.customer.findUnique({ where: { code } }));
    return code;
  }

  const normPhone = (s="") => s.replace(/[^\d+]/g, "");
  const toInt = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  /* 1) lista compacta (mapa) */
  router.get("/", async (_, res) => {
    try {
      const list = await prisma.customer.findMany({
        select: { id:true, name:true, lat:true, lng:true, daysOff:true },
        orderBy: { updatedAt:"desc" }
      });
      res.json(list);
    } catch (err) {
      console.error("[CUSTOMERS/] error:", err);
      res.status(500).json({ error:"internal" });
    }
  });

  /* 1.b) listado admin (Backoffice) + últimos N */
  router.get("/admin", async (req, res) => {
    const q    = (req.query.q || "").trim();
    const take = Math.min(toInt(req.query.take) || 50, 200);
    const skip = toInt(req.query.skip) || 0;

    const digits = q.replace(/\D/g, "");
    try {
      const where = q ? {
        OR: [
          { name     : { contains: q, mode:"insensitive" } },
          digits ? { phone   : { contains: digits } } : undefined,
          { email    : { contains: q, mode:"insensitive" } },   // ← búsqueda por email
          { code     : { contains: q, mode:"insensitive" } },
          { address_1: { contains: q, mode:"insensitive" } },
        ].filter(Boolean)
      } : {};

      const [items, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          orderBy: { createdAt: "desc" }, // últimos agregados primero
          select: {
            id:true, code:true, name:true,
            phone:true, email:true,
            address_1:true, portal:true, observations:true,
            isRestricted:true, restrictedAt:true, restrictionReason:true,
            createdAt:true, updatedAt:true
          },
          skip, take
        }),
        prisma.customer.count({ where })
      ]);

      res.json({ items, total, skip, take });
    } catch (err) {
      console.error("[CUSTOMERS/admin] error:", err);
      res.status(500).json({ error:"internal" });
    }
  });

  /* 2) búsqueda rápida por phone/address_1 (rápida) */
  router.get("/search", async (req, res) => {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);
    const digits = q.replace(/\D/g, "");
    const text   = q.toUpperCase();
    try {
      const found = await prisma.customer.findMany({
        where:{
          OR:[
            digits ? { phone    : { contains:digits } } : undefined,
            { address_1         : { contains:text } }
          ].filter(Boolean)
        },
        take:5,
        orderBy:{ updatedAt:"desc" }
      });
      res.json(found);
    } catch (err) {
      console.error("[CUSTOMERS/search] error:", err);
      res.status(500).json({ error:"internal" });
    }
  });

  /* 3) alta/upsert real (con email) */
  router.post("/", async (req, res) => {
    try {
      let {
        name, phone, email,
        address_1, portal, observations,
        lat, lng
      } = req.body;

      phone = normPhone(phone || "");
      if (!address_1 && !phone)
        return res.status(400).json({ error:"address_1 o phone requerido" });

      // coords si hay address_1 y faltan
      let geo = { lat: lat != null ? +lat : null, lng: lng != null ? +lng : null };
      if (address_1 && (!geo.lat || !geo.lng)) {
        const { data:g } = await axios.get(
          "https://maps.googleapis.com/maps/api/geocode/json",
          { params:{ address:address_1, components:"country:ES", key:GOOGLE } }
        );
        if (!g.results?.length)
          return res.status(400).json({ error:"Dirección no encontrada" });
        geo = g.results[0].geometry.location;
      }

      const data = { name, phone, email, address_1, portal, observations, ...geo };

      // upsert por address_1 si existe; si no, por phone
      let saved;
      if (address_1) {
        saved = await prisma.customer.upsert({
          where : { address_1 },
          update: data,
          create: { code: await genCustomerCode(), origin:"PHONE", ...data }
        });
      } else {
        const existing = await prisma.customer.findFirst({ where: { phone } });
        saved = existing
          ? await prisma.customer.update({ where:{ id: existing.id }, data })
          : await prisma.customer.create({ data:{ code: await genCustomerCode(), origin:"PHONE", ...data } });
      }

      res.json(saved);
    } catch (err) {
      console.error("[CUSTOMERS/post]", err);
      // conflictos por uniques: Prisma lanza P2002
      if (err.code === "P2002") {
        return res.status(409).json({ error:"Unique constraint violation", meta: err.meta });
      }
      res.status(500).json({ error:"internal" });
    }
  });

  /* 3.b) edición simple (incluye email) */
  router.patch("/:id", async (req, res) => {
    const id = +req.params.id;
    if (!id) return res.status(400).json({ error:"Invalid ID" });
    try {
      const { name, phone, email, address_1, portal, observations, lat, lng } = req.body;
      const data = {
        ...(name != null ? { name } : {}),
        ...(phone != null ? { phone: normPhone(phone) } : {}),
        ...(email != null ? { email } : {}),
        ...(address_1 != null ? { address_1 } : {}),
        ...(portal != null ? { portal } : {}),
        ...(observations != null ? { observations } : {}),
        ...(lat != null ? { lat: +lat } : {}),
        ...(lng != null ? { lng: +lng } : {}),
      };
      const updated = await prisma.customer.update({ where:{ id }, data });
      res.json(updated);
    } catch (err) {
      console.error("[CUSTOMERS/patch]", err);
      if (err.code === "P2002") {
        return res.status(409).json({ error:"Unique constraint violation", meta: err.meta });
      }
      res.status(500).json({ error:"internal" });
    }
  });

  /* 3.c) restricción / quitar restricción */
  router.patch("/:id/restrict", async (req, res) => {
    const id = +req.params.id;
    if (!id) return res.status(400).json({ error: "Invalid ID" });

    const flag   = !!req.body.isRestricted;
    const reason = (req.body.reason || "").trim();

    try {
      const updated = await prisma.customer.update({
        where: { id },
        data : {
          isRestricted     : flag,
          restrictionReason: reason || null,
          restrictedAt     : flag ? new Date() : null
        }
      });
      res.json(updated);
    } catch (err) {
      console.error("[CUSTOMERS/restrict]", err);
      res.status(500).json({ error:"internal" });
    }
  });

  /* 4) eliminar (duro; si prefieres soft delete, lo cambiamos) */
  router.delete("/:id", async (req, res) => {
    const id = +req.params.id;
    if (!id) return res.status(400).json({ error: "Invalid ID" });
    try {
      await prisma.customer.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      console.error("[CUSTOMERS/delete]", err);
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
};
