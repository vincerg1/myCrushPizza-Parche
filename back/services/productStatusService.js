const { computeProductStatus } = require("./productStatusService");

/**
 * Recalcula y persiste el status de un producto (MenuPizza)
 * en función del estado de sus ingredientes.
 *
 * @param {object} prisma
 * @param {number} menuPizzaId
 */
async function recomputeMenuPizzaStatus(prisma, menuPizzaId) {
  // 1️⃣ Cargar ingredientes del producto
  const menuPizza = await prisma.menuPizza.findUnique({
    where: { id: menuPizzaId },
    include: {
      ingredients: {
        include: {
          ingredient: true,
        },
      },
    },
  });

  if (!menuPizza) return;

  // 2️⃣ Calcular estado derivado
  const { available } = computeProductStatus(menuPizza.ingredients);

  const newStatus = available ? "ACTIVE" : "INACTIVE";

  // 3️⃣ Persistir solo si cambia
  if (menuPizza.status !== newStatus) {
    await prisma.menuPizza.update({
      where: { id: menuPizzaId },
      data: { status: newStatus },
    });
  }
}

module.exports = {
  recomputeMenuPizzaStatus,
};
