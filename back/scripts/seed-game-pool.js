// scripts/seed-game-pool.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/** === Config por CLI o .env ===
 *  --gameId=1         | GAME_ID
 *  --amount=5         | GAME_COUPON_AMOUNT (en €)
 *  --qty=50           | GAME_POOL_QTY
 *  --usage=1          | GAME_USAGE_LIMIT (por cupón)
 *  --campaign=MCP_HALLOWEEN | GAME_CAMPAIGN
 */
function readArg(name, def) {
  const m = process.argv.find(a => a.startsWith(`--${name}=`));
  return m ? m.split('=').slice(1).join('=') : (process.env[name.toUpperCase()] ?? def);
}

const gameId    = Number(readArg('gameId', 1));
const amount    = Number(readArg('amount', 5));
const qty       = Math.max(1, Math.min(Number(readArg('qty', 50)), 10000));
const usage     = Math.max(1, Number(readArg('usage', 1)));
const campaign  = readArg('campaign', null);

if (!Number.isFinite(gameId) || !Number.isFinite(amount) || amount <= 0) {
  console.error('❌ Parámetros inválidos. Usa --gameId=N --amount=€ --qty=N [--usage=N] [--campaign=TXT]');
  process.exit(1);
}

// Generador de códigos
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const pick = n => Array.from({ length: n }, () => ALPH[Math.floor(Math.random()*ALPH.length)]).join('');
const makeCode = () => `MCP-GA${String(gameId).padStart(2,'0')}-${pick(4)}${pick(2)}`;

(async () => {
  try {
    console.log('🧩 Seeding pool de juego…', { gameId, amount, qty, usage, campaign });

    // Prepara filas
    const rows = [];
    const codes = new Set();
    while (codes.size < qty) codes.add(makeCode());
    for (const code of codes) {
      rows.push({
        code,
        kind: 'AMOUNT',
        variant: 'FIXED',
        amount: String(amount),          // Decimal(10,2) como string
        usageLimit: usage,
        usedCount: 0,
        status: 'ACTIVE',

        // Etiquetas para el pool del juego
        acquisition: 'GAME',
        channel: 'GAME',
        gameId,
        campaign,

        // restricciones opcionales: ninguna (se asigna expiresAt al emitir)
        activeFrom: null,
        expiresAt: null,
        daysActive: null,
        windowStart: null,
        windowEnd: null
      });
    }

    // Inserta
    const result = await prisma.coupon.createMany({
      data: rows,
      skipDuplicates: true
    });

    console.log(`✅ Creado(s): ${result.count} cupón(es) para GAME #${gameId}`);
  } catch (e) {
    console.error('❌ Error en seed:', e.message || e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
