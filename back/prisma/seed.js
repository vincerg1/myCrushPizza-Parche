// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {

  // ─────────────────────────────────────────────
  // 0) CATEGORÍAS DE PIZZAS (orden visual del menú)
  // ─────────────────────────────────────────────
  const CATEGORIES = [
    "Pizza Básica",
    "Pizza Frita",
    "Pizza Especial",
    "Pizza Dulce",
    "Extras",
    "Bebidas",
    "Complementos",
    "Postres",
  ];

  for (let i = 0; i < CATEGORIES.length; i++) {
    const name = CATEGORIES[i];

    await prisma.category.upsert({
      where: { name },
      update: { position: i },
      create: {
        name,
        position: i,
      },
    });
  }

  console.log("✔ Categorías sincronizadas");


  // ─────────────────────────────────────────────
  // 1) GAME
  // ─────────────────────────────────────────────
  const game = await prisma.game.upsert({
    where: { code: 'DAILY_NUMBER' },
    update: {},
    create: {
      code: 'DAILY_NUMBER',
      name: 'Número ganador diario',
      active: true
    }
  });

  console.log('Game id:', game.id);

  // ─────────────────────────────────────────────
  // 2) CUPONES
  // ─────────────────────────────────────────────
  const existing = await prisma.coupon.count({
    where: { acquisition: 'GAME', channel: 'GAME', gameId: game.id }
  });

  if (existing === 0) {
    const rows = [];
    const mkCode = () => {
      const pick = (s)=>s[Math.floor(Math.random()*s.length)];
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const block = (n)=>Array.from({length:n},()=>pick(A)).join('');
      return `MCP-GM${block(2)}-${block(4)}`;
    };

    // 10 cupones 5€
    for (let i=0;i<10;i++){
      rows.push({
        code: mkCode(),
        kind: 'AMOUNT',
        variant: 'FIXED',
        amount: '5.00',
        usageLimit: 1,
        status: 'ACTIVE',
        acquisition: 'GAME',
        channel: 'GAME',
        gameId: game.id,
      });
    }

    // 10 cupones 10%
    for (let i=0;i<10;i++){
      rows.push({
        code: mkCode(),
        kind: 'PERCENT',
        variant: 'FIXED',
        percent: 10,
        maxAmount: '8.00',
        usageLimit: 1,
        status: 'ACTIVE',
        acquisition: 'GAME',
        channel: 'GAME',
        gameId: game.id,
      });
    }

    await prisma.coupon.createMany({ data: rows, skipDuplicates: true });
    console.log('Pool creado:', rows.length, 'cupones');
  } else {
    console.log('Pool ya existente:', existing, 'cupones');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
