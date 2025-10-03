/* eslint-disable consistent-return */
const express = require("express");
const axios   = require("axios");
const router  = express.Router();
const GOOGLE  = process.env.GOOGLE_GEOCODING_KEY;

module.exports = (prisma) => {

  /* helper: CUS-##### único -------------------------------------- */
  async function genCustomerCode() {
    let code;
    do {
      code = "CUS-" + Math.floor(10000 + Math.random() * 90000);
    } while (await prisma.customer.findUnique({ where: { code } }));
    return code;
  }

  const normPhone = (s = "") => s.replace(/[^\d+]/g, "");
  const toInt = (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  /* ────────────────────────────────────────────────────────────────
   * 1)  GET /api/customers
   *     → lista compacta para el mapa  (id, name, lat, lng, daysOff)
   * ---------------------------------------------------------------- */
  router.get("/", async (_, res) => {
    try {
      const list = await prisma.customer.findMany({
        select: {
          id      : true,
          name    : true,
          lat     : true,
          lng     : true,
          daysOff : true              //  ← ya calculado en tu DB
        },
        orderBy: { updatedAt: "desc" }
      });
      res.json(list);
    } catch (err) {
      console.error("[CUSTOMERS/] error:", err);
      res.status(500).json({ error: "internal" });
    }
  });

  /* ────────────────────────────────────────────────────────────────
   * 1.b) GET /api/customers/admin?q=&skip=&take=
   *      → listado completo para Backoffice (búsqueda amplia)
   * ---------------------------------------------------------------- */
  router.get("/admin", async (req, res) => {
    const q    = (req.query.q || "").trim();
    const skip = toInt(req.query.skip) || 0;
    const take = Math.min(toInt(req.query.take) || 50, 200);

    // filtros
    const digits = q.replace(/\D/g, "");
    const text   = q.toUpperCase();

    try {
      const where = q ? {
        OR: [
          { name     : { contains: q, mode: "insensitive" } },
          digits ? { phone   : { contains: digits } } : undefined,
          { email    : { contains: q, mode: "insensitive" } },
          { code     : { contains: q, mode: "insensitive" } },
          { address_1: { contains: text } },
          // Si usas String[] para tags en Postgres:
          // { tags: { has: q } }
        ].filter(Boolean)
      } : {};

      const [items, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip, take
        }),
        prisma.customer.count({ where })
      ]);

      res.json({ items, total, skip, take });
    } catch (err) {
      console.error("[CUSTOMERS/admin] error:", err);
      res.status(500).json({ error: "internal" });
    }
  });

  /* ────────────────────────────────────────────────────────────────
   * 2)  GET /api/customers/search?q=…
   *     → por teléfono (dígitos) o address_1 (texto) – rápido
   * ---------------------------------------------------------------- */
  router.get("/search", async (req, res) => {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);

    const digits = q.replace(/\D/g, "");
    const text   = q.toUpperCase();

    try {
      const found = await prisma.customer.findMany({
        where:{
          OR:[
            digits ? { phone:     { contains:digits } } : undefined,
            { address_1:{ contains:text } }
          ].filter(Boolean)
        },
        take:5,
        orderBy:{ updatedAt:"desc" }
      });
      console.log("[SEARCH]", q, `→ ${found.length} hit(s)`);
      res.json(found);
    } catch (err) {
      console.error("[CUSTOMERS/search] error:", err);
      res.status(500).json({ error:"internal" });
    }
  });

  /* ────────────────────────────────────────────────────────────────
   * 3)  POST /api/customers
   *     → crea o actualiza (upsert) por address_1 **o** por phone
   *        - si hay address_1 y faltan coords ⇒ geocode
   *        - permite alta manual sin address (p.ej. sólo teléfono)
   * ---------------------------------------------------------------- */
  router.post("/", async (req, res) => {
    try {
      let {
        name, phone, email,
        address_1, portal, observations, // compat anterior
        notes, tags,                      // nuevos opcionales
        lat, lng
      } = req.body;

      phone = normPhone(phone || "");
      const hasAddress = !!address_1;
      const hasPhone   = !!phone;

      if (!hasAddress && !hasPhone) {
        return res.status(400).json({ error: "address_1 o phone requerido" });
      }

      // ① coords si hay address_1 y faltan
      let geo = { lat: lat != null ? +lat : null, lng: lng != null ? +lng : null };
      if (hasAddress && (!geo.lat || !geo.lng)) {
        const { data:g } = await axios.get(
          "https://maps.googleapis.com/maps/api/geocode/json",
          { params:{ address:address_1, components:"country:ES", key:GOOGLE } }
        );
        if (!g.results?.length)
          return res.status(400).json({ error:"Dirección no encontrada" });
        geo = g.results[0].geometry.location;
      }

      // Preparar datos
      const data = {
        name, phone, email,
        address_1, portal,
        observations, notes,
        ...(Array.isArray(tags) ? { tags } : {}),
        ...geo
      };

      // ② upsert flexible: prioriza address_1 si existe, si no por phone
      let saved;
      if (hasAddress) {
        saved = await prisma.customer.upsert({
          where : { address_1 },
          update: data,
          create: { code: await genCustomerCode(), ...data }
        });
      } else {
        // si no hay address, usamos phone como (pseudo) unique lógico
        // (recomendado: crear índice único en phone si procede)
        const existing = await prisma.customer.findFirst({ where: { phone } });
        if (existing) {
          saved = await prisma.customer.update({
            where: { id: existing.id },
            data
          });
        } else {
          saved = await prisma.customer.create({
            data: { code: await genCustomerCode(), ...data }
          });
        }
      }

      res.json(saved);
    } catch (err) {
      console.error("[CUSTOMERS/post]", err);
      res.status(500).json({ error:"internal" });
    }
  });

  /* ────────────────────────────────────────────────────────────────
   * 3.b) PATCH /api/customers/:id
   *      → editar campos generales (sin geocode automático)
   * ---------------------------------------------------------------- */
  router.patch("/:id", async (req, res) => {
    const id = +req.params.id;
    if (!id) return res.status(400).json({ error: "Invalid ID" });

    try {
      const {
        name, phone, email,
        address_1, portal,
        observations, notes, tags,
        lat, lng
      } = req.body;

      const data = {
        ...(name != null ? { name } : {}),
        ...(phone != null ? { phone: normPhone(phone) } : {}),
        ...(email != null ? { email } : {}),
        ...(address_1 != null ? { address_1 } : {}),
        ...(portal != null ? { portal } : {}),
        ...(observations != null ? { observations } : {}),
        ...(notes != null ? { notes } : {}),
        ...(Array.isArray(tags) ? { tags } : {}),
        ...(lat != null ? { lat: +lat } : {}),
        ...(lng != null ? { lng: +lng } : {}),
      };

      const updated = await prisma.customer.update({ where: { id }, data });
      res.json(updated);
    } catch (err) {
      console.error("[CUSTOMERS/patch]", err);
      res.status(500).json({ error: "internal" });
    }
  });

  /* ────────────────────────────────────────────────────────────────
   * 3.c) PATCH /api/customers/:id/restrict
   *      body: { isRestricted: boolean, reason?: string }
   * ---------------------------------------------------------------- */
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
      res.status(500).json({ error: "internal" });
    }
  });

  /* ────────────────────────────────────────────────────────────────
   * 4)  DELETE /api/customers/:id
   *     → elimina cliente por ID (recomendado: soft delete)
   * ---------------------------------------------------------------- */
  router.delete("/:id", async (req, res) => {
    const id = +req.params.id;
    if (!id) return res.status(400).json({ error: "Invalid ID" });

    try {
      // Si tu esquema tiene soft delete:
      // const out = await prisma.customer.update({
      //   where: { id },
      //   data : { isDeleted: true, deletedAt: new Date() }
      // });
      // return res.json({ ok:true, soft:true });

      await prisma.customer.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      console.error("[CUSTOMERS/delete]", err);
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
};
