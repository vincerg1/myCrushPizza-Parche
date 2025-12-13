// back/routes/whatsappWebhook.js
/* eslint-disable consistent-return */
const express = require("express");
const crypto = require("crypto");
const { esBase9, toE164ES } = require("../utils/phone");

module.exports = (prisma) => {
  const router = express.Router();

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";
  const APP_SECRET = process.env.META_APP_SECRET || "";

  // ---------- helpers ----------
  function verifyMetaSignature(req) {
    // Meta manda: X-Hub-Signature-256: sha256=<hex>
    if (!APP_SECRET) return true; // recomendado: configurar META_APP_SECRET en Railway
    const sig = req.get("x-hub-signature-256");
    if (!sig || !sig.startsWith("sha256=")) return false;

    const expected =
      "sha256=" +
      crypto.createHmac("sha256", APP_SECRET).update(req.body).digest("hex");

    // timing-safe compare
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  function normalizeE164(fromRaw) {
    const raw = String(fromRaw || "").trim();
    // WhatsApp suele mandar "3469..." (sin +). toE164ES lo debería convertir a +34...
    const e164 = toE164ES(raw) || (raw.startsWith("+") ? raw : `+${raw}`);
    return e164;
  }

  // ---------- 1) Webhook verification (GET) ----------
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

        const changes = payload?.entry?.flatMap((e) => e.changes || []) || [];

        for (const ch of changes) {
          const value = ch?.value || {};
          const messages = value?.messages || [];
          const contacts = value?.contacts || [];
          const metadata = value?.metadata || {};

          for (const m of messages) {
            const fromRaw = m.from; // wa_id (normalmente dígitos sin +)
            const msgId = m.id || null;
            const ts = m.timestamp; // epoch seconds (string)
            const type = m.type || null;

            const text = type === "text" ? (m.text?.body || "") : null;

            const fromE164 = normalizeE164(fromRaw);
            const base9 = esBase9(fromE164) || null;

            const contact = contacts.find(
              (c) => String(c?.wa_id || "") === String(fromRaw || "")
            );
            const username = contact?.profile?.name || null;

            const msgDate = ts ? new Date(Number(ts) * 1000) : new Date();

            console.log("[WA IN]", {
              phone_number_id: metadata?.phone_number_id,
              from: fromE164,
              waMessageId: msgId,
              ts,
              type,
              text,
            });

            // 1) Upsert conversación por teléfono
            const convo = await prisma.whatsAppConversation.upsert({
              where: { phoneE164: fromE164 },
              create: {
                phoneE164: fromE164,
                phoneBase9: base9,
                username,
                lastMessageAt: msgDate,
                isOpen: true,
              },
              update: {
                // solo sobreescribe si llega valor
                phoneBase9: base9 ?? undefined,
                username: username ?? undefined,
                lastMessageAt: msgDate,
                isOpen: true,
              },
            });

            // 2) Insertar mensaje (ignorar duplicados si Meta reintenta)
            try {
              await prisma.whatsAppMessage.create({
                data: {
                  conversationId: convo.id,
                  waMessageId: msgId,
                  direction: "IN",
                  status: "RECEIVED",
                  from: fromE164,
                  to: metadata?.display_phone_number
                    ? String(metadata.display_phone_number)
                    : null,
                  type,
                  text,
                  timestamp: msgDate,
                },
              });
            } catch (e) {
              // P2002 = unique constraint (waMessageId duplicado)
              if (e?.code !== "P2002") throw e;
            }
          }
        }
      } catch (err) {
        console.error("[WA webhook] FAIL:", err?.message || err);
        // Si llegamos aquí antes del res.sendStatus(200), Meta reintentaría.
        // Pero ya respondimos 200 arriba en la ruta feliz.
      }
    }
  );

  return router;
};
