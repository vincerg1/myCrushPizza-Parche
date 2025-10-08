/* eslint-disable consistent-return */
const express = require("express");
const axios   = require("axios");
const { esBase9, toE164ES } = require("../utils/phone");
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

    // --- normalización: base9 + (opcional) E.164 para guardar
    const base9 = esBase9(phone || "");
    if (!base9) return res.status(400).json({ error: "phone requerido" });
    const phoneE164 = toE164ES(phone) || String(phone || "");

    // --- helper: buscar cualquier número que contenga esos 9 dígitos
    async function findByBase9(b9) {
      try {
        // si existe columna phoneBase9, úsala también
        return await prisma.customer.findFirst({
          where: { OR: [{ phone: { contains: b9 } }, { phoneBase9: b9 }] },
          select: { id: true, code: true, phone: true }
        });
      } catch {
        // fallback si no existe phoneBase9
        return await prisma.customer.findFirst({
          where: { phone: { contains: b9 } },
          select: { id: true, code: true, phone: true }
        });
      }
    }

    // --- duplicado por base9
    const existing = await findByBase9(base9);
    if (existing) {
      return res.status(409).json({ error: "phone_exists", customer: existing });
    }

    // --- address opcional (PICKUP si no llega)
    let address = (address_1 || "").trim();
    if (!address) address = `(PICKUP) ${phoneE164}`;

    // --- coords iniciales
    let geo = {
      lat: lat != null ? +lat : null,
      lng: lng != null ? +lng : null
    };

    // --- geocode si procede
    const isPickup = /^\(PICKUP\)/i.test(address);
    if (!isPickup && (!geo.lat || !geo.lng) && GOOGLE) {
      try {
        const { data: g } = await axios.get(
          "https://maps.googleapis.com/maps/api/geocode/json",
          { params: { address, components: "country:ES", key: GOOGLE } }
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

    const baseData = {
      name,
      phone: phoneE164,         // guardamos normalizado (con +34 si es válido)
      email,
      address_1: address,
      portal,
      observations,
      ...geo
    };

    // --- crear (intentando guardar phoneBase9 si existe la columna)
    let saved;
    try {
      saved = await prisma.customer.create({
        data: { code: await genCustomerCode(), origin: "PHONE", phoneBase9: base9, ...baseData }
      });
    } catch (e) {
      // si la columna no existe en el esquema -> reintenta sin ella
      if (/Unknown arg `phoneBase9`/i.test(e?.message)) {
        saved = await prisma.customer.create({
          data: { code: await genCustomerCode(), origin: "PHONE", ...baseData }
        });
      } else {
        throw e;
      }
    }

    res.json(saved);
  } catch (err) {
    console.error("[CUSTOMERS/post]", err);
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Unique constraint violation", meta: err.meta });
    }
    res.status(500).json({ error: "internal" });
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

  router.post("/resegment", async (_req, res) => {
    try {
      // --- helpers ---
      const moneyKeys = [
        "total", "grandTotal", "importe", "amount",
        "totalAmount", "amount_total", "total_amount", "price", "subtotal"
      ];
      const dateKeys = ["createdAt", "date", "deliveredAt", "updatedAt"];

      const getMoney = (s) => {
        for (const k of moneyKeys) {
          const v = Number(s?.[k]);
          if (Number.isFinite(v) && v > 0) return v;
        }
        return 0;
      };
      const getDate = (s) => {
        for (const k of dateKeys) {
          const d = s?.[k];
          if (d) return new Date(d);
        }
        return null;
      };

      // Intenta varias selecciones; si falla una, prueba la siguiente
      async function tryFindManySales(selects) {
        let lastErr;
        for (const s of selects) {
          try { return await prisma.sale.findMany(s); }
          catch (e) { lastErr = e; }
        }
        throw lastErr;
      }

      // ① Ventas de toda la empresa para ticket medio
      const allSales = await tryFindManySales([
        { select: { createdAt: true, total: true, grandTotal: true, importe: true, amount: true } },
        { select: { createdAt: true, total: true, importe: true } },
        { select: { createdAt: true, total: true } },
        { }, // último recurso: trae todas las columnas
      ]);

      const totals = allSales.map(getMoney).filter(n => n > 0);
      const companyAvg = totals.length ? (totals.reduce((a,b)=>a+b,0) / totals.length) : 0;

      // ② Clientes con sus ventas (con fallback también)
      async function fetchCustomersWithSales() {
        const tries = [
          { select: { id:true, segment:true, sales: { select: { createdAt:true, total:true, grandTotal:true, importe:true, amount:true } } } },
          { select: { id:true, segment:true, sales: { select: { createdAt:true, total:true, importe:true } } } },
          { select: { id:true, segment:true, sales: { select: { createdAt:true, total:true } } } },
          { select: { id:true, segment:true, sales: true } } // todo el objeto sale
        ];
        let lastErr;
        for (const s of tries) {
          try { return await prisma.customer.findMany(s); }
          catch (e) { lastErr = e; }
        }
        throw lastErr;
      }

      const customers = await fetchCustomersWithSales();

      const nowMs = Date.now();
      const daysBetween = (ms1, ms2) => Math.floor((ms1 - ms2) / (1000*60*60*24));

      const updates = [];
      const counts  = { S1:0, S2:0, S3:0, S4:0 };
      let changed = 0;

      for (const c of customers) {
        const sales = c.sales || [];
        const orders = sales.length;

        // última fecha
        let lastDate = null;
        for (const s of sales) {
          const d = getDate(s);
          if (d && (!lastDate || d > lastDate)) lastDate = d;
        }
        const days = lastDate ? daysBetween(nowMs, lastDate.getTime()) : Infinity;

        // ticket medio del cliente
        const sum = sales.reduce((acc, s) => acc + getMoney(s), 0);
        const avg = orders ? sum / orders : 0;

        // reglas S1..S4
        let seg = "S1";
        if (orders <= 1) seg = "S1";
        else if (days > 30) seg = "S2";
        else { seg = "S3"; if (avg > companyAvg) seg = "S4"; }

        counts[seg]++;
        if (seg !== c.segment) {
          changed++;
          updates.push(
            prisma.customer.update({
              where: { id: c.id },
              data : { segment: seg, segmentUpdatedAt: new Date() }
            })
          );
        }
      }

      if (updates.length) await prisma.$transaction(updates);
      res.json({ ok:true, companyAvg, changed, counts });

    } catch (err) {
      console.error("[/customers/resegment] FAIL:", err);
      res.status(500).json({
        error: "internal",
        message: err?.message || "unknown",
        code: err?.code || null
      });
    }
  });

  router.get("/segment-stats", async (_req, res) => {
  try {
    const [bySeg, total, restricted] = await Promise.all([
      prisma.customer.groupBy({
        by: ["segment"],
        _count: { _all: true }
      }),
      prisma.customer.count(),
      prisma.customer.count({ where: { isRestricted: true } })
    ]);

    const counts = { S1: 0, S2: 0, S3: 0, S4: 0 };
    for (const row of bySeg) {
      if (row.segment && counts.hasOwnProperty(row.segment)) {
        counts[row.segment] = row._count._all || 0;
      }
    }

    res.json({
      total,
      counts,
      active: { restricted, unrestricted: Math.max(total - restricted, 0) },
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("[/customers/segment-stats] FAIL:", err);
    res.status(500).json({ error: "internal" });
  }
});

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
/* 1.c) comprobar restricción por teléfono */
router.get("/restriction", async (req, res) => {
  try {
    const q = req.query.phone || req.query.q || "";
    const base9 = esBase9(q);

    // si no se puede obtener base9 devolvemos "no restringido"
    if (!base9) {
      return res.json({
        exists: false,
        isRestricted: 0,
        restricted: false,
        reason: "",
        code: ""
      });
    }

    async function findByBase9(b9) {
      try {
        return await prisma.customer.findFirst({
          where: { OR: [{ phone: { contains: b9 } }, { phoneBase9: b9 }] },
          select: {
            id: true, code: true,
            isRestricted: true,
            restrictionReason: true,
            restrictedAt: true
          }
        });
      } catch {
        return await prisma.customer.findFirst({
          where: { phone: { contains: b9 } },
          select: {
            id: true, code: true,
            isRestricted: true,
            restrictionReason: true,
            restrictedAt: true
          }
        });
      }
    }

    const c = await findByBase9(base9);

    if (!c) {
      return res.json({
        exists: false,
        isRestricted: 0,
        restricted: false,
        reason: "",
        code: ""
      });
    }

    const isR = !!c.isRestricted;
    res.json({
      exists: true,
      isRestricted: isR ? 1 : 0,   // lo que consume el front
      restricted: isR,             // compat adicional
      reason: c.restrictionReason || "",
      code: c.code || "",
      restrictedAt: c.restrictedAt || null
    });
  } catch (err) {
    console.error("[CUSTOMERS/restriction] error:", err);
    res.status(500).json({ error: "internal" });
  }
});


  return router;
};
