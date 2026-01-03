// services/recomputeMenuPizzaStatus.js
const { computeProductStatus } = require("./productStatusService");

/**
 * Recalcula y persiste el status de una MenuPizza
 */
async function recomputeMenuPizzaStatus(prisma, menuPizzaId) {
  if (!menuPizzaId) return;

  const menuPizza = await prisma.menuPizza.findUnique({
    where: { id: menuPizzaId },
    include: {
      ingredients: {
        include: { ingredient: true },
      },
    },
  });

  if (!menuPizza) return;

  const { available } = computeProductStatus(menuPizza.ingredients);
  const newStatus = available ? "ACTIVE" : "INACTIVE";

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
