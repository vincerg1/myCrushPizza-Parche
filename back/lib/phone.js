// back/lib/phone.js
function toE164(raw, defaultCountry = 'ES') {
  if (!raw) return null;
  let s = String(raw).trim();

  // elimina todo lo que no sea dígito o +
  s = s.replace(/[^\d+]/g, '');

  // 00… -> +…
  if (s.startsWith('00')) s = '+' + s.slice(2);

  // si ya viene con + y tiene pinta de E.164, lo dejamos
  if (s.startsWith('+') && s.length >= 10 && s.length <= 16) return s;

  // si viene sin prefijo y parece móvil fijo ES (9 dígitos)
  const digits = s.replace(/\D/g, '');
  if ((defaultCountry === 'ES') && digits.length === 9) {
    return `+34${digits}`;
  }

  // último intento: si no empieza con +, prefija con +
  if (!s.startsWith('+')) s = '+' + s;
  return s;
}

module.exports = { toE164 };
