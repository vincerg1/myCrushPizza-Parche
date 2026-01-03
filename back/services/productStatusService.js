// services/productStatusService.js

/**
 * Calcula el estado derivado de un producto
 * según el estado de sus ingredientes.
 *
 * REGLA:
 * - Si TODOS los ingredientes están ACTIVE → AVAILABLE
 * - Si ALGUNO está INACTIVE → NOT AVAILABLE
 */
function computeProductStatus(menuPizzaIngredients = []) {
  if (!Array.isArray(menuPizzaIngredients) || menuPizzaIngredients.length === 0) {
    return { available: true, blockedBy: [] };
  }

  const blockedBy = [];

  for (const row of menuPizzaIngredients) {
    const ing = row.ingredient;
    if (!ing) continue;

    if (ing.status === "INACTIVE") {
      blockedBy.push({ id: ing.id, name: ing.name });
    }
  }

  return {
    available: blockedBy.length === 0,
    blockedBy,
  };
}

module.exports = {
  computeProductStatus,
};
