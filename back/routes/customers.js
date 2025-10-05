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
          { email    : { contains: q, mode:"insensitive" } },
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

  /* 3) alta/upsert real (con email) — address opcional y geocoding “suave” */
  router.post("/", async (req, res) => {
    try {
      let {
        name, phone, email,
        address_1, portal, observations,
        lat, lng
      } = req.body;

      // normalizar phone
      phone = normPhone(phone || "");

      // Reglas: necesitamos al menos phone O address_1
      if (!phone && !address_1)
        return res.status(400).json({ error:"phone o address_1 requerido" });

      // Si falta address_1, generamos uno de cortesía (cumple UNIQUE)
      // patrón coherente con tus datos existentes: "(PICKUP) <phone>"
      let address = (address_1 || "").trim();
      if (!address) {
        address = phone ? `(PICKUP) ${phone}` : `(PICKUP) ${Date.now()}`;
      }

      // coords iniciales (mantener null si no vienen válidas)
      let geo = {
        lat: lat != null ? +lat : null,
        lng: lng != null ? +lng : null
      };

      // Geocode solo si:
      // - hay address "real" (no PICKUP)
      // - faltan coords
      // - hay GOOGLE key
      const isPickupAddr = /^\(PICKUP\)/i.test(address);
      if (!isPickupAddr && (!geo.lat || !geo.lng) && GOOGLE) {
        try {
          const { data:g } = await axios.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            { params:{ address, components:"country:ES", key:GOOGLE } }
          );
          const loc = g?.results?.[0]?.geometry?.location;
          if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
            geo = { lat: loc.lat, lng: loc.lng };
          } else {
            // antes devolvía 400; ahora seguimos sin coords
            console.warn("[CUSTOMERS/post] Geocode sin resultados, guardo sin coords:", address);
          }
        } catch (e) {
          // fallo de geocode: continuamos
          console.warn("[CUSTOMERS/post] Geocode error, guardo sin coords:", e?.message);
        }
      }

      const data = { name, phone, email, address_1: address, portal, observations, ...geo };

      // upsert por address_1 (UNIQUE)
      const saved = await prisma.customer.upsert({
        where : { address_1: address },
        update: data,
        create: { code: await genCustomerCode(), origin:"PHONE", ...data }
      });

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
