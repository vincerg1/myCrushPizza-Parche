function formatDateES(date) {
  try {
    return new Date(date).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch {
    return "";
  }
}

module.exports.buildReservationSMS = function ({
  customerName,
  reservationDate,
  reservationTime,
  partySize,
  cancelLink
}) {

  const date = formatDateES(reservationDate)

  return `Hola ${customerName || ""} 👋

Tu reserva está confirmada 🍕

📅 ${date}
⏰ ${reservationTime}
👥 ${partySize} personas

Si necesitas cancelar:
${cancelLink}

Te esperamos en
MyCrushPizza 🍕`
}