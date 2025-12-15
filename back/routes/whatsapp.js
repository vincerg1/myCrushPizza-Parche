// back/routes/whatsapp.js
/* eslint-disable consistent-return */
const express = require("express");
const axios = require("axios");
const { esBase9, toE164ES } = require("../utils/phone");

const router = express.Router();

module.exports = (prisma) => {
  // Helpers
  const normToE164 = (raw = "") => {
    // intenta normalizar a E164 ES; si no, devuelve dígitos
    return toE164ES(raw) || raw.replace(/[^\d+]/g, "");
  };

  const countUnread = async (conversationId) => {
    // “unread” = mensajes entrantes aún en RECEIVED
    return prisma.whatsAppMessage.count({
      where: { conversationId, direction: "IN", status: "RECEIVED" },
    });
  };

  /* ───────── Conversations ───────── */
  router.get("/conversations", async (_req, res) => {
    try {
      const items = await prisma.whatsAppConversation.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          messages: { orderBy: { timestamp: "desc" }, take: 1 },
        },
      });

      // calculamos unread por conversación (en paralelo)
      const unreadArr = await Promise.all(items.map((c) => countUnread(c.id)));

      res.json(
        items.map((c, idx) => ({
          id: c.id,
          phoneE164: c.phoneE164,
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

  /* ───────── Messages ───────── */
  router.get("/messages/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid_id" });

    try {
      const messages = await prisma.whatsAppMessage.findMany({
        where: { conversationId: id },
        orderBy: { timestamp: "asc" },
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

  /* ───────── Send message ───────── */
  router.post("/send", async (req, res) => {
    try {
      const toRaw = req.body?.to;
      const text = (req.body?.text || "").trim();

      if (!toRaw || !text) {
        return res.status(400).json({ error: "to & text required" });
      }

      const to = normToE164(toRaw); // en tu captura usabas wa_id numérico: también vale
      const phoneBase9 = esBase9(to) || null;

      const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const TOKEN = process.env.WHATSAPP_TOKEN;

      if (!PHONE_NUMBER_ID || !TOKEN) {
        return res.status(500).json({ error: "missing_whatsapp_env" });
      }

      // 1) upsert conversación por phoneE164
      const conv = await prisma.whatsAppConversation.upsert({
        where: { phoneE164: to },
        create: {
          phoneE164: to,
          phoneBase9,
          username: null,
          addressText: null,
          isOpen: true,
          lastMessageAt: new Date(),
        },
        update: {
          isOpen: true,
          lastMessageAt: new Date(),
        },
      });

      // 2) enviar a Meta
      const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

      let waMessageId = null;

      try {
        const resp = await axios.post(
          url,
          {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: text },
          },
          {
            headers: {
              Authorization: `Bearer ${TOKEN}`,
              "Content-Type": "application/json",
            },
            timeout: 15000,
          }
        );

        waMessageId = resp?.data?.messages?.[0]?.id || null;
      } catch (err) {
        const status = err?.response?.status || 500;
        const meta = err?.response?.data || null;
        console.error("[WA /send] META FAIL:", status, meta || err?.message);

        return res.status(status).json({
          error: "send_failed",
          status,
          meta,
        });
      }

      // 3) guardar OUT en BD
      await prisma.whatsAppMessage.create({
        data: {
          conversationId: conv.id,
          waMessageId,
          direction: "OUT",
          status: "SENT",
          from: "BUSINESS",
          to,
          type: "text",
          text,
          timestamp: new Date(),
        },
      });

      res.json({ ok: true, waMessageId });
    } catch (e) {
      console.error("[WA /send] FAIL:", e?.message || e);
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
};
