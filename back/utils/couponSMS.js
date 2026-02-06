// utils/couponSMS.js

function formatDateES(date) {
  try {
    return new Date(date).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function formatDiscount({ kind, variant, percent, percentMin, percentMax, amount }) {
  if (kind === "PERCENT") {
    if (variant === "RANGE" && percentMin != null && percentMax != null) {
      return `Descuento: ${percentMin}% – ${percentMax}%`;
    }
    if (percent != null) {
      return `Descuento: ${percent}%`;
    }
  }

  if (kind === "AMOUNT" && amount != null) {
    return `Descuento: ${Number(amount).toFixed(2)}€`;
  }

  return "";
}

module.exports.buildCouponSMS = function ({
  customerName,
  code,
  expiresAt,
  kind,
  variant,
  percent,
  percentMin,
  percentMax,
  amount,
}) {
  const name = customerName || "";
  const exp = expiresAt ? formatDateES(expiresAt) : "";
  const discountLine = formatDiscount({
    kind,
    variant,
    percent,
    percentMin,
    percentMax,
    amount,
  });

  return (
`Hola ${name} 👋

Hemos creado para ti un cupón exclusivo:

CÓDIGO
${code}

${discountLine}
Válido hasta ${exp}

Canjéalo en:
www.mycrushpizza.com 🍕

¡Buen provecho!`
  );
};
