const express = require("express");
const axios = require("axios");
const router = express.Router();

module.exports = (prisma) => {

  /* ───────── Conversations ───────── */
  router.get("/conversations", async (_req, res) => {
    const items = await prisma.whatsAppConversation.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { timestamp: "desc" },
          take: 1
        }
      }
    });

    res.json(items.map(c => ({
      id: c.id,
      phone: c.phone,
      lastMessage: c.messages[0]?.text || "",
      updatedAt: c.updatedAt,
      unread: c.unreadCount || 0
    })));
  });

  /* ───────── Messages ───────── */
  router.get("/messages/:id", async (req, res) => {
    const id = Number(req.params.id);

    const messages = await prisma.whatsAppMessage.findMany({
      where: { conversationId: id },
      orderBy: { timestamp: "asc" }
    });

    // marcar como leídos
    await prisma.whatsAppConversation.update({
      where: { id },
      data: { unreadCount: 0 }
    });

    res.json(messages);
  });

  /* ───────── Send message ───────── */
  router.post("/send", async (req, res) => {
    const { to, text } = req.body;
    if (!to || !text) {
      return res.status(400).json({ error: "to & text required" });
    }

    const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    await axios.post(url, {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    }, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    // guardar OUT
    await prisma.whatsAppMessage.create({
      data: {
        from: "operator",
        to,
        direction: "OUT",
        text,
        timestamp: new Date()
      }
    });

    res.json({ ok: true });
  });

  return router;
};
