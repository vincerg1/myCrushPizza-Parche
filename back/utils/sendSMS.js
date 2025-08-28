// utils/sendSMS.js
const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_MESSAGING_SERVICE_SID, // MGxxxxxxxxxxxxxxxxxxxx
  TWILIO_STATUS_CALLBACK_URL,   // opcional
} = process.env;

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Normaliza a E.164; por defecto añade +34
const DEFAULT_CC = '+34';
function toE164(raw) {
  if (!raw) return null;
  let s = String(raw).trim();

  // deja solo dígitos y +
  s = s.replace(/[^\d+]/g, '');

  // 00… -> +…
  if (s.startsWith('00')) s = '+' + s.slice(2);

  // si no empieza con +, asume ES (+34) y quita ceros a la izquierda
  if (!s.startsWith('+')) s = DEFAULT_CC + s.replace(/^0+/, '');

  return s;
}

module.exports = async function sendSMS(to, body) {
  if (!to || !body) throw new Error('Parámetros requeridos: to, body');
  if (!TWILIO_MESSAGING_SERVICE_SID) {
    throw new Error('Falta TWILIO_MESSAGING_SERVICE_SID');
  }

  const dest = toE164(to);
  if (!/^\+\d{8,15}$/.test(dest)) throw new Error('Invalid phone after formatting');

  const payload = {
    messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID, // 👈 usa el MSID (Alpha Sender dentro)
    to: dest,
    body,
  };
  if (TWILIO_STATUS_CALLBACK_URL) payload.statusCallback = TWILIO_STATUS_CALLBACK_URL;

  // IMPORTANTE: NO poner "from" cuando usas messagingServiceSid
  return client.messages.create(payload);
};
