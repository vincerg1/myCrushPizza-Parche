// services/recomputeMenuPizzasForIngredient.js
const { recomputeMenuPizzaStatus } = require("./recomputeMenuPizzaStatus");

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
