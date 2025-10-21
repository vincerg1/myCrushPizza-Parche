// back/cron/couponsTick.js
require('dotenv').config();
const cron = require('node-cron');
const { PrismaClient, CouponStatus } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Marca:
 *  - EXPIRED:  cupones activos cuyo expiresAt ya pasó
 *  - USED:     cupones activos con usedCount >= usageLimit
 */
async function couponsTick() {
  const now = new Date();

  // 1) Expirar por fecha
  const expired = await prisma.coupon.updateMany({
    where: {
      status: CouponStatus.ACTIVE,
      expiresAt: { lt: now },
    },
    data: { status: CouponStatus.EXPIRED },
  });

  // 2) Pasar a USED cuando el uso alcanzó el límite (comparación por fila)
  const candidates = await prisma.coupon.findMany({
    where: { status: CouponStatus.ACTIVE },
    select: { id: true, usedCount: true, usageLimit: true },
  });

  const toMarkUsed = candidates
    .filter(c => (c.usageLimit ?? 1) <= (c.usedCount ?? 0))
    .map(c => c.id);

  let used = { count: 0 };
  if (toMarkUsed.length) {
    used = await prisma.coupon.updateMany({
      where: { id: { in: toMarkUsed } },
      data: { status: CouponStatus.USED },
    });
  }

  return { expired: expired.count, used: used.count, at: now.toISOString() };
}

/* ---- Programación del cron ----
   Todos los días a las 00:05 (hora Madrid). 
   Cambia la expresión si prefieres otra hora. */
if (process.env.DISABLE_COUPON_CRON !== '1') {
  cron.schedule('5 0 * * *', async () => {
    try {
      const result = await couponsTick();
      console.log('[cron couponsTick]', result);
    } catch (err) {
      console.error('[cron couponsTick] error:', err);
    }
  }, { timezone: 'Europe/Madrid' });

  // (Opcional) Ejecutar una vez al arrancar para “limpiar” el estado
  couponsTick().then(r => console.log('[boot couponsTick]', r))
               .catch(e => console.error('[boot couponsTick] error:', e));
}

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = { couponsTick };
