/* eslint-disable consistent-return */
const express = require("express");
const axios = require("axios");
const { esBase9, toE164ES } = require("../utils/phone");

const router = express.Router();

module.exports = (prisma) => {
  // ───────── Helpers ─────────
  const normToE164 = (raw = "") => {
    const cleaned = String(raw).trim();
    return toE164ES(cleaned) || cleaned.replace(/[^\d+]/g, "");
  };

  const toMetaNumber = (e164 = "") => String(e164).replace("+", ""); // Meta suele recibir sin +

  const countUnread = (conversationId) =>
    prisma.whatsAppMessage.count({
      where: { conversationId, direction: "IN", status: "RECEIVED" },
    });

  // ───────── Conversations ─────────
  router.get("/conversations", async (_req, res) => {
    try {
      const items = await prisma.whatsAppConversation.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          messages: {
            orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
        },
      });

      const unreadArr = await Promise.all(items.map((c) => countUnread(c.id)));

      res.json(
        items.map((c, idx) => ({
          id: c.id,
          phoneE164: c.phoneE164,
          // si ya no usas base9, lo puedes dejar igual o eliminar del response
          phoneBase9: c.phoneBase9,
          username: c.username,
          lastMessage: c.messages?.[0]?.text || "",
          lastMessageAt: c.lastMessageAt || null,
          updatedAt: c.updatedAt,
          unread: unreadArr[idx] || 0,
          isOpen: !!c.isOpen,
        }))
      );
    } catch (e) {
      console.error("[WA /conversations] FAIL:", e?.message || e);
      res.status(500).json({ error: "internal" });
    }
  });

  // ───────── Messages ─────────
  router.get("/messages/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    try {
      const messages = await prisma.whatsAppMessage.findMany({
        where: { conversationId: id },
        orderBy: [{ timestamp: "asc" }, { createdAt: "asc" }],
      });

      // marcar como leídos: IN + RECEIVED -> READ
      await prisma.whatsAppMessage.updateMany({
        where: { conversationId: id, direction: "IN", status: "RECEIVED" },
        data: { status: "READ" },
      });

      res.json(messages);
    } catch (e) {
      console.error("[WA /messages] FAIL:", e?.message || e);
      res.status(500).json({ error: "internal" });
    }
  });

  // ───────── Send message ─────────
  router.post("/send", async (req, res) => {
    try {
      const toRaw = req.body?.to;
      const text = (req.body?.text || "").trim();

      // opcional: para enviar template si lo necesitas
      const templateName = (req.body?.templateName || "").trim();
      const templateLang = (req.body?.templateLang || "es_ES").trim();

      if (!toRaw) return res.status(400).json({ error: "to required" });
      if (!text && !templateName) {
        return res.status(400).json({ error: "text or templateName required" });
      }

      const toE164 = normToE164(toRaw);     // "+3469..."
      const toMeta = toMetaNumber(toE164);  // "3469..."

      const phoneBase9 = esBase9(toE164) || null; // si ya no lo usas: puedes dejarlo null siempre

      const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const TOKEN = process.env.WHATSAPP_TOKEN;

      if (!PHONE_NUMBER_ID || !TOKEN) {
        return res.status(500).json({ error: "missing_whatsapp_env" });
      }

      // 1) upsert conversación por phoneE164
      const now = new Date();
      const conv = await prisma.whatsAppConversation.upsert({
        where: { phoneE164: toE164 },
        create: {
          phoneE164: toE164,
          phoneBase9, // o null si lo quieres matar ya
          username: null,
          addressText: null,
          isOpen: true,
          lastMessageAt: now,
        },
        update: {
          isOpen: true,
          lastMessageAt: now,
        },
      });

      // 2) enviar a Meta
      const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

      const payload = templateName
        ? {
            messaging_product: "whatsapp",
            to: toMeta,
            type: "template",
            template: {
              name: templateName,
              language: { code: templateLang },
            },
          }
        : {
            messaging_product: "whatsapp",
            to: toMeta,
            type: "text",
            text: { body: text },
          };

      let waMessageId = null;

      try {
        const resp = await axios.post(url, payload, {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        });

        waMessageId = resp?.data?.messages?.[0]?.id || null;
      } catch (err) {
        const status = err?.response?.status || 500;
        const meta = err?.response?.data || null;
        console.error("[WA /send] META FAIL:", status, meta || err?.message);
        return res.status(status).json({ error: "send_failed", status, meta });
      }

      // 3) guardar OUT en BD
      await prisma.whatsAppMessage.create({
        data: {
          conversationId: conv.id,
          waMessageId,
          direction: "OUT",
          status: "SENT",
          from: "BUSINESS",
          to: toE164,
          type: payload.type,
          text: payload.type === "text" ? text : null,
          timestamp: now,
        },
      });

      res.json({ ok: true, waMessageId, type: payload.type });
    } catch (e) {
      console.error("[WA /send] FAIL:", e?.message || e);
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
};
