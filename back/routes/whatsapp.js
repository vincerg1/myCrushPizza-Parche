// back/routes/whatsapp.js
const express = require("express");
const axios = require("axios");
const { esBase9 } = require("../utils/phone");

const router = express.Router();

module.exports = (prisma) => {
  const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID; // ej: 9576497...
  const TOKEN = process.env.WHATSAPP_TOKEN;

  const toDigits = (s = "") => String(s).replace(/[^\d]/g, "");
  const toE164Guess = (digits = "") => (digits.startsWith("34") ? `+${digits}` : `+${digits}`); // simple

  /* ───────── Conversations ───────── */
  router.get("/conversations", async (_req, res) => {
    const items = await prisma.whatsAppConversation.findMany({
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { timestamp: "desc" }, take: 1 } },
    });

    res.json(
      items.map((c) => ({
        id: c.id,
        phoneE164: c.phoneE164,
        username: c.username,
        lastMessage: c.messages[0]?.text || "",
        updatedAt: c.updatedAt,
        unread: c.unread || 0,
      }))
    );
  });

  /* ───────── Messages ───────── */
  router.get("/messages/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const messages = await prisma.whatsAppMessage.findMany({
      where: { conversationId: id },
      orderBy: { timestamp: "asc" },
    });

    // marcar como leídos (EL CORRECTO: el id de la conversación)
    await prisma.whatsAppConversation.update({
      where: { id },
      data: { unread: 0 },
    });

    res.json(messages);
  });

  /* ───────── Send message ───────── */
  router.post("/send", async (req, res) => {
    try {
      const toRaw = req.body?.to;
      const text = req.body?.text;

      if (!toRaw || !text) return res.status(400).json({ error: "to & text required" });
      if (!PHONE_NUMBER_ID || !TOKEN) {
        return res.status(500).json({ error: "Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TOKEN" });
      }

      const to = toDigits(toRaw); // Meta espera dígitos (sin +)
      const phoneE164 = toE164Guess(to);
      const phoneBase9 = esBase9(phoneE164) || null;

      // 1) upsert conversación por phoneE164
      const conv = await prisma.whatsAppConversation.upsert({
        where: { phoneE164 },
        create: {
          phoneE164,
          phoneBase9,
          username: null,
          addressText: null,
          unread: 0,
          lastMessageAt: new Date(),
          isOpen: true,
        },
        update: {
          lastMessageAt: new Date(),
          isOpen: true,
        },
      });

      // 2) enviar a Meta
      const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

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

      const waMessageId = resp?.data?.messages?.[0]?.id || null;

      // 3) guardar OUT (con conversationId + waMessageId)
      await prisma.whatsAppMessage.create({
        data: {
          conversationId: conv.id,
          waMessageId: waMessageId || `OUT_${Date.now()}`, // fallback para no romper unique si lo tienes required
          direction: "OUT",
          status: "SENT",
          from: String(PHONE_NUMBER_ID), // o tu número business si prefieres
          to: phoneE164,
          type: "text",
          text,
          timestamp: new Date(),
        },
      });

      // 4) refrescar “last message”
      await prisma.whatsAppConversation.update({
        where: { id: conv.id },
        data: { updatedAt: new Date() },
      });

      res.json({ ok: true, waMessageId });
    } catch (err) {
      // si es error de Meta (axios), devolvemos su payload
      const status = err?.response?.status || 500;
      const payload = err?.response?.data || null;

      console.error("[WA /send] FAIL:", status, payload || err?.message || err);
      res.status(status).json({
        error: "send_failed",
        status,
        meta: payload,
      });
    }
  });

  return router;
};
