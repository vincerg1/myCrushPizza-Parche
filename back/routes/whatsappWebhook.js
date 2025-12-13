// back/routes/whatsappWebhook.js
/* eslint-disable consistent-return */
const express = require("express");
const crypto = require("crypto");

module.exports = (prisma) => {
  const router = express.Router();

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";
  const APP_SECRET   = process.env.META_APP_SECRET || "";

  // ---------- helpers ----------
  function verifyMetaSignature(req) {
    // Meta manda: X-Hub-Signature-256: sha256=<hex>
    if (!APP_SECRET) return true; // si no lo configuras, no bloqueamos (pero NO recomendado)
    const sig = req.get("x-hub-signature-256");
    if (!sig || !sig.startsWith("sha256=")) return false;

    const expected = "sha256=" + crypto
      .createHmac("sha256", APP_SECRET)
      .update(req.body) // <- raw body Buffer
      .digest("hex");

    // timing-safe compare
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // ---------- 1) Webhook verification (GET) ----------
  // Meta llamará algo como:
  // /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=123
  router.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(String(challenge));
    }
    return res.sendStatus(403);
  });

  // ---------- 2) Incoming events (POST) ----------
  // IMPORTANT: raw body para verificar firma
  router.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      try {
        if (!verifyMetaSignature(req)) {
          console.warn("[WA webhook] Invalid signature");
          return res.sendStatus(401);
        }

        const payload = JSON.parse(req.body.toString("utf8"));

        // Acknowledge rápido (Meta recomienda responder 200 ASAP)
        res.sendStatus(200);

        // --- Aquí procesas mensajes ---
        // Estructura típica:
        // payload.entry[].changes[].value.messages[]
        const changes = payload?.entry?.flatMap(e => e.changes || []) || [];
        for (const ch of changes) {
          const value = ch?.value;
          const messages = value?.messages || [];
          const contacts = value?.contacts || [];
          const metadata = value?.metadata || {};

          for (const m of messages) {
            const from = m.from;                 // teléfono del cliente (wa id)
            const msgId = m.id;
            const ts = m.timestamp;
            const type = m.type;

            const text = type === "text" ? (m.text?.body || "") : "";

            console.log("[WA IN]", {
              phone_number_id: metadata?.phone_number_id,
              from,
              msgId,
              ts,
              type,
              text
            });

            // TODO (siguiente paso): guardar en BD:
            // - resolve customer por base9 (tu helper esBase9)
            // - insertar en tabla Message/Conversation
            // - marcar unread para el panel del operador
          }
        }

      } catch (err) {
        console.error("[WA webhook] FAIL:", err?.message || err);
        // OJO: ya respondimos 200 arriba si llegó a esa línea.
        // Si quieres, podrías mover res.sendStatus(200) justo antes del return.
      }
    }
  );

  return router;
};
