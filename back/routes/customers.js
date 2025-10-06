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

  /* 1.b) listado admin (Backoffice) + últimos N — SOLO búsqueda por teléfono */
  router.get("/admin", async (req, res) => {
    const q    = (req.query.q || "").trim();
    const take = Math.min(toInt(req.query.take) || 50, 200);
    const skip = toInt(req.query.skip) || 0;

    // solo dígitos para teléfono
    const digits = q.replace(/\D/g, "");
    const where = digits ? { phone: { contains: digits } } : {};

    try {
      const [items, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          orderBy: { createdAt: "desc" },
          select: {
            id:true, code:true, name:true,
            phone:true, email:true,
            address_1:true, portal:true, observations:true,
            isRestricted:true, restrictedAt:true, restrictionReason:true,
            segment:true, segmentUpdatedAt:true,     // ★ segmento
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

  /* 3) alta (con email) — phone obligatorio, address opcional, geocoding “suave” y sin duplicar phone */
  router.post("/", async (req, res) => {
    try {
      let {
        name, phone, email,
        address_1, portal, observations,
        lat, lng
      } = req.body;

      // normalizar phone y exigirlo
      phone = normPhone(phone || "");
      if (!phone) return res.status(400).json({ error: "phone requerido" });

      // si el phone ya existe → 409
      const existingByPhone = await prisma.customer.findUnique({ where: { phone } });
      if (existingByPhone) {
        return res.status(409).json({ error: "phone_exists", customer: existingByPhone });
      }

      // address_1 opcional (si falta, generamos PICKUP)
      let address = (address_1 || "").trim();
      if (!address) address = `(PICKUP) ${phone}`;

      // coords iniciales
      let geo = {
        lat: lat != null ? +lat : null,
        lng: lng != null ? +lng : null
      };

      // Geocode solo si no es PICKUP, faltan coords y hay GOOGLE key
      const isPickup = /^\(PICKUP\)/i.test(address);
      if (!isPickup && (!geo.lat || !geo.lng) && GOOGLE) {
        try {
          const { data:g } = await axios.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            { params:{ address, components:"country:ES", key:GOOGLE } }
          );
          const loc = g?.results?.[0]?.geometry?.location;
          if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
            geo = { lat: loc.lat, lng: loc.lng };
          } else {
            console.warn("[CUSTOMERS/post] Geocode sin resultados, guardo sin coords:", address);
          }
        } catch (e) {
          console.warn("[CUSTOMERS/post] Geocode error, guardo sin coords:", e?.message);
        }
      }

      const data = { name, phone, email, address_1: address, portal, observations, ...geo };

      // crear (address_1 es UNIQUE; si choca, Prisma devolverá P2002)
      const saved = await prisma.customer.create({
        data: { code: await genCustomerCode(), origin: "PHONE", ...data }
      });

      res.json(saved);
    } catch (err) {
      console.error("[CUSTOMERS/post]", err);
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

  /* 3.d) recalcular segmentos (S1..S4) */
  router.post("/resegment", async (_req, res) => {
    try {
      // ① Ticket medio empresa (media de los importes)
      const allSales = await prisma.sale.findMany({
        select: { total:true, amount:true, importe:true, grandTotal:true }
      });
      const getMoney = (s) => {
        const n = Number(
          s?.total ?? s?.amount ?? s?.importe ?? s?.grandTotal ?? 0
        );
        return Number.isFinite(n) ? n : 0;
      };
      const totals = allSales.map(getMoney).filter(n => n > 0);
      const companyAvg = totals.length ? (totals.reduce((a,b)=>a+b,0) / totals.length) : 0;

      // ② Traemos los clientes con sus ventas (fechas e importes)
      const customers = await prisma.customer.findMany({
        select: {
          id:true,
          segment:true,
          sales: {
            select: { createdAt:true, total:true, amount:true, importe:true, grandTotal:true }
          }
        }
      });

      const now = Date.now();
      const daysBetween = (d1, d2) => Math.floor((d1 - d2) / (1000*60*60*24));

      const updates = [];
      const counts  = { S1:0, S2:0, S3:0, S4:0 };
      let changed = 0;

      for (const c of customers) {
        const sales = c.sales || [];
        const orders = sales.length;
        const last   = orders ? sales.reduce((m,s)=> (m > s.createdAt ? m : s.createdAt), sales[0].createdAt) : null;
        const days   = last ? daysBetween(now, new Date(last).getTime()) : Infinity;
        const avg    = orders
          ? sales.reduce((acc,s)=> acc + getMoney(s), 0) / orders
          : 0;

        // regla de segmentación:
        // S1: 0–1 compras
        // S2: >1 compras y última > 30 días
        // S3: última ≤ 30 días
        // S4: S3 y ticket medio > ticket medio empresa
        let seg = "S1";
        if (orders <= 1) {
          seg = "S1";
        } else if (days > 30) {
          seg = "S2";
        } else {
          seg = "S3";
          if (avg > companyAvg) seg = "S4";
        }

        counts[seg]++;

        if (seg !== c.segment) {
          changed++;
          updates.push(prisma.customer.update({
            where: { id: c.id },
            data : { segment: seg, segmentUpdatedAt: new Date() }
          }));
        }
      }

      if (updates.length) await prisma.$transaction(updates);

      res.json({ ok:true, companyAvg, changed, counts });
    } catch (err) {
      console.error("[CUSTOMERS/resegment] error:", err);
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
