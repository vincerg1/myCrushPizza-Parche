const { recomputeMenuPizzaStatus } = require("./recomputeMenuPizzaStatus");

/**
 * Recalcula el STATUS GLOBAL de las pizzas afectadas por un ingrediente
 *
 * REGLA:
 * - SOLO se ejecuta cuando cambia Ingredient.status (admin)
 * - NO tiene en cuenta tiendas
 * - La disponibilidad por tienda se calcula dinámicamente en menuDisponible
 */
async function recomputeMenuPizzasForIngredient(prisma, ingredientId) {
  const ingId = Number(ingredientId);
  if (!Number.isFinite(ingId)) return;

  const pizzas = await prisma.menuPizza.findMany({
    where: {
      ingredients: {
        some: { ingredientId: ingId },
      },
    },
    select: { id: true },
  });

  for (const p of pizzas) {
    await recomputeMenuPizzaStatus(prisma, p.id);
  }
}

module.exports = {
  recomputeMenuPizzasForIngredient,
};
