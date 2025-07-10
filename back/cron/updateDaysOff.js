/* ────────── cron/updateDaysOff.js ────────── */
const cron             = require("node-cron");
const { PrismaClient } = require("@prisma/client");
const prisma           = new PrismaClient();

/**
 * Recalcula customer.daysOff = días transcurridos desde la última venta
 *  - Clientes sin ventas ⇒ null  (para poder filtrarlos aparte si quieres)
 *  - Se persiste directamente en la tabla Customer
 */
async function refreshCustomerDaysOff () {
  const now = Date.now();

  /* 1) última venta de cada cliente */
  const latest = await prisma.sale.groupBy({
    by   : ["customerId"],
    where: { customerId: { not: null } },
    _max : { date: true }
  });
  const lastById = Object.fromEntries(
    latest.map(r => [r.customerId, r._max.date?.getTime()])
  );

  /* 2) customers a actualizar */
  const allIds = Object.keys(lastById).map(Number);

  /* 3) transacción – UPDATE masivo */
  await prisma.$transaction(async (tx) => {
    /* a) clientes con ventas -> set daysOff */
    for (const id of allIds) {
      const diff = now - lastById[id];          // ms
      const days = diff < 0 ? null : Math.round(diff / 86_400_000);
      await tx.customer.update({
        where: { id },
        data : { daysOff: days }
      });
    }

    /* b) clientes sin ventas -> null si no lo estaban */
    await tx.customer.updateMany({
      where: { id: { notIn: allIds } },
      data : { daysOff: null }
    });
  });

  console.table(await prisma.customer.findMany({
    select: { id:true, name:true, daysOff:true }, orderBy:{ id:"asc" }
  }));
  console.info(`[cron] daysOff updated (${new Date().toLocaleString()})`);
}

/* ── agenda automática: todos los días a las 17:45 ───────────── */
/*            ┌ min (45)   ┌ hour (17)   ┌ day-of-month *
 * ───────────┴────────────┴─────────────┴──────────────┬ month *
 *                                                      └ day-of-week *
 */
cron.schedule("20 10 * * *", refreshCustomerDaysOff, {
  timezone: "Europe/Madrid"          // ajusta si tu servidor está en otra zona
});

/* ── también lo exportamos para lanzarlo a mano cuando quieras ── */
module.exports = refreshCustomerDaysOff;
