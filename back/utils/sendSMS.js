// utils/sendSMS.js
const twilio = require('twilio');
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const DEFAULT_CC = '+34';  // 🇪🇸

function toE164(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return `+${digits}`;
  return `${DEFAULT_CC}${digits}`;
}

module.exports = async function sendSMS(to, body) {
  const dest = toE164(to);                                 // ← renombrado
  if (!/^\+\d{8,15}$/.test(dest)) {
    throw new Error('Invalid phone after formatting');
  }

  return client.messages.create({
    to   : dest,
    from : process.env.TWILIO_FROM_NUMBER, // tu nº Twilio
    body
  });
};
