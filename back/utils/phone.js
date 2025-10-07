// back/utils/phone.js
// Normalizador para España: trabaja con el "base9" (los 9 dígitos nacionales)

const ES_CC = "34";

const onlyDigits = (s = "") => String(s).replace(/\D/g, "");

/**
 * Devuelve los 9 dígitos nacionales (sin prefijo país).
 * Acepta formatos: 690..., +34690..., 0034690..., 34690..., etc.
 */
function esBase9(s = "") {
  const d = onlyDigits(s);
  if (!d) return "";
  if (d.startsWith("00" + ES_CC)) return d.slice(2 + ES_CC.length).slice(-9);
  if (d.startsWith(ES_CC)) return d.slice(ES_CC.length).slice(-9);
  return d.slice(-9); // si vienen más de 9, nos quedamos con los 9 últimos
}

/**
 * Intenta devolver E.164 para ES si el input es válido (9 dígitos).
 * Si no llega a 9, devuelve cadena vacía.
 */
function toE164ES(s = "") {
  const base9 = esBase9(s);
  return base9.length === 9 ? `+${ES_CC}${base9}` : "";
}

module.exports = { onlyDigits, esBase9, toE164ES };
