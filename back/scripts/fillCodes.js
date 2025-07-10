import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function makeCode(prefix) {
  return `${prefix}-${Math.floor(10000 + Math.random()*90000)}`; // 5 dígitos
}

async function fill(table, prefix) {
  const rows = await prisma[table].findMany({ where: { code: null } });
  for (const row of rows) {
    let code;
    do { code = makeCode(prefix); }
    while (await prisma[table].findUnique({ where: { code }}));
    await prisma[table].update({ where:{ id: row.id }, data:{ code }});
  }
}

(async () => {
  await fill('customer', 'CUS');
  await fill('sale',     'ORD');
  await prisma.$disconnect();
})();
