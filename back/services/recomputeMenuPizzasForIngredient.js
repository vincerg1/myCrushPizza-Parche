const { computeProductStatus } = require("./productStatusService");

async function recomputeMenuPizzasForIngredient(prisma, ingredientId) {
  // 1️⃣ Buscar todas las pizzas que usan este ingrediente
  const menuPizzas = await prisma.menuPizza.findMany({
    where: {
      ingredients: {
        some: {
          ingredientId,
        },
      },
    },
    include: {
      ingredients: {
        include: {
          ingredient: true,
        },
      },
    },
  });

  // 2️⃣ Recalcular status de cada una
  for (const pizza of menuPizzas) {
    const { available } = computeProductStatus(pizza.ingredients);
    const newStatus = available ? "ACTIVE" : "INACTIVE";

    if (pizza.status !== newStatus) {
      await prisma.menuPizza.update({
        where: { id: pizza.id },
        data: { status: newStatus },
      });
    }
  }
}

module.exports = {
  recomputeMenuPizzasForIngredient,
};
