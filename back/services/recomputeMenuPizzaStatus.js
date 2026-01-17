/**
 * Recalcula y persiste el status GLOBAL de una MenuPizza
 *
 * REGLA GLOBAL:
 * - Si TODOS los ingredientes están ACTIVE → MenuPizza.ACTIVE
 * - Si ALGUNO está INACTIVE → MenuPizza.INACTIVE
 *
 * ⚠️ NO considera tiendas
 */
async function recomputeMenuPizzaStatus(prisma, menuPizzaId) {
  if (!menuPizzaId) return;

  const menuPizza = await prisma.menuPizza.findUnique({
    where: { id: menuPizzaId },
    include: {
      ingredients: {
        include: {
          ingredient: {
            select: { status: true },
          },
        },
      },
    },
  });

  if (!menuPizza) return;

  const hasInactiveIngredient = menuPizza.ingredients.some(
    (rel) => rel.ingredient.status !== "ACTIVE"
  );

  const newStatus = hasInactiveIngredient ? "INACTIVE" : "ACTIVE";

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
