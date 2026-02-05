// scripts/seed-coupons.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// === CONFIG RÁPIDA ===
// TAG: "RC" (random/fijo %), "PF" (% fijo), "CD" (€ fijo)
const TAG = process.env.SEED_TAG || "RC"; // RC por defecto
const COUNT = Number(process.env.SEED_COUNT || 1000);

// Mantengo los mismos nombres/estructura:
function randomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0 ni I/1
  const pick = (n) => Array.from({ length: n }, () => A[Math.floor(Math.random() * A.length)]).join('');
  // nuevo patrón: MCP-<TAG><2car>-<4car>  → p.ej. MCP-RCOX-X26C
  return `MCP-${String(TAG).toUpperCase()}${pick(2)}-${pick(4)}`;
}

async function main(count = COUNT) {
  const set = new Set();
  const rows = [];

  while (rows.length < count) {
    const code = randomCode();
    if (set.has(code)) continue;
    set.add(code);

    // percent aleatorio 5..10 (cada cupón queda con % fijo propio)
    const percent = 5 + Math.floor(Math.random() * 6); // 5..10

    // Ajustado al esquema NUEVO de Coupon:
    // - kind/variant segun cupón % fijo
    // - usageLimit/usedCount/status
    // - amount/maxAmount/segments/etc. nulos por defecto
    rows.push({
      code,
      kind: 'PERCENT',            // para € fijo sería 'AMOUNT'
      variant: 'FIXED',           // dejamos FIXED; cada cupón ya tiene su % propio
      percent,
      amount: null,               // si usas AMOUNT, pon String(número)
      percentMin: null,
      percentMax: null,
      maxAmount: null,
      segments: null,
      assignedTold: null,
      activeFrom: null,
      expiresAt: null,
      daysActive: null,
      windowStart: null,
      windowEnd: null,
      usageLimit: 1,
      usedCount: 0,
      status: 'ACTIVE',
      // createdAt: default(now) en esquema
    });
  }

  const res = await prisma.coupon.createMany({ data: rows, skipDuplicates: true });
  console.log(`[seed-coupons] inserted: ${res.count} (TAG=${String(TAG).toUpperCase()})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect().finally(() => process.exit(1));
  });
