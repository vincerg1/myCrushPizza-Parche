// scripts/seed-coupons.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function randomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0 ni I/1
  const pick = (n) => Array.from({ length: n }, () => A[Math.floor(Math.random() * A.length)]).join('');
  return `MCP-${pick(4)}-${pick(4)}`;
}

async function main(count = 1000) {
  const set = new Set();
  const rows = [];
  while (rows.length < count) {
    const code = randomCode();
    if (set.has(code)) continue;
    set.add(code);
    const percent = 5 + Math.floor(Math.random() * 6); // 5..10
    rows.push({ code, percent, used: false });
  }

  const res = await prisma.coupon.createMany({ data: rows, skipDuplicates: true });
  console.log(`[seed-coupons] inserted: ${res.count}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect().finally(() => process.exit(1));
  });
