// back/lib/sms.js
const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_MESSAGING_SERVICE_SID,
  TWILIO_STATUS_CALLBACK_URL,
  TWILIO_ALPHA_SENDER_ID, // opcional, por si quieres sobreescribir "MYCRUSHPIZZA"
} = process.env;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Normaliza números de ES a E.164 (+34...)
function toE164ES(phone) {
  const raw = String(phone).replace(/[^\d+]/g, '');
  if (raw.startsWith('+')) return raw;           // ya viene en E.164
  if (/^\d{9}$/.test(raw)) return `+34${raw}`;   // 9 dígitos -> +34...
  if (raw.startsWith('0')) return `+34${raw.slice(1)}`;
  return raw; // último recurso, lo envía tal cual
}

/**
 * Enviar SMS.
 * Usa primero Messaging Service; si no existe, usa Alpha Sender.
 */
async function sendSMS({ to, body, from }) {
  if (!to || !body) throw new Error('to y body son requeridos');

  const payload = {
    to: toE164ES(to),
    body,
  };

  if (TWILIO_MESSAGING_SERVICE_SID) {
    payload.messagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
  } else {
    payload.from = from || TWILIO_ALPHA_SENDER_ID || 'MYCRUSHPIZZA';
  }

  if (TWILIO_STATUS_CALLBACK_URL) {
    payload.statusCallback = TWILIO_STATUS_CALLBACK_URL;
  }

  const msg = await client.messages.create(payload);
  return msg; // contiene sid, status, etc.
}

module.exports = { sendSMS, toE164ES, client };
