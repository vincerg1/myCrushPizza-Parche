async function zeroStockForNewPizza(prisma, pizzaId) {
  const stores = await prisma.store.findMany({ select: { id: true } });
  if (!stores.length) return;

  await prisma.storePizzaStock.createMany({
    data: stores.map(s => ({ storeId: s.id, pizzaId, stock: 0 })),
    // skipDuplicates: true   ←  NO compatible con SQLite
  });
}

async function zeroStockForNewStore(prisma, storeId) {
  const pizzas = await prisma.menuPizza.findMany({ select: { id: true } });
  if (!pizzas.length) return;

  await prisma.storePizzaStock.createMany({
    data: pizzas.map(p => ({ storeId, pizzaId: p.id, stock: 0 })),
    // skipDuplicates: true   ←  idem
  });
}

module.exports = { zeroStockForNewPizza, zeroStockForNewStore };
