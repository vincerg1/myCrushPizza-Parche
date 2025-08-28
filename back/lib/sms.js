// back/lib/sms.js
const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_MESSAGING_SERVICE_SID, // MGxxxxxxxx (OBLIGATORIO)
  TWILIO_STATUS_CALLBACK_URL     // opcional
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.warn('[twilio] Faltan credenciales TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN');
}
if (!TWILIO_MESSAGING_SERVICE_SID) {
  console.warn('[twilio] Falta TWILIO_MESSAGING_SERVICE_SID');
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Normaliza a E.164. Por defecto añade +34 si no hay prefijo.
function toE164(raw, defaultCc = '+34') {
  if (!raw) return raw;
  let n = String(raw).replace(/[^\d+]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (!n.startsWith('+')) n = defaultCc + n;
  return n;
}

async function sendSms({ to, body }) {
  if (!to || !body) throw new Error('Parámetros requeridos: to, body');
  if (!TWILIO_MESSAGING_SERVICE_SID) throw new Error('Falta TWILIO_MESSAGING_SERVICE_SID');

  const payload = {
    to: toE164(to),
    body,
    messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID
  };

  if (TWILIO_STATUS_CALLBACK_URL) {
    payload.statusCallback = TWILIO_STATUS_CALLBACK_URL;
  }

  // No incluir "from" cuando usamos messagingServiceSid
  const msg = await client.messages.create(payload);
  return msg;
}

module.exports = { sendSms };
