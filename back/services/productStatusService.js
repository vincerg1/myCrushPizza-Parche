// services/productStatusService.js

/**
 * Calcula el estado derivado de un producto
 * según el estado de sus ingredientes.
 *
 * REGLA:
 * - Si TODOS los ingredientes están ACTIVE → available = true
 * - Si ALGUNO está INACTIVE → available = false
 */
function computeProductStatus(menuPizzaIngredients = []) {
  if (!Array.isArray(menuPizzaIngredients) || menuPizzaIngredients.length === 0) {
    return { available: true, blockedBy: [] };
  }

  const blockedBy = [];

  for (const row of menuPizzaIngredients) {
    const ing = row.ingredient;
    const storeStock = ing?.storeStocks?.[0];

    // si no existe registro por tienda → bloquea
    if (!storeStock) {
      blockedBy.push({ id: ing.id, name: ing.name, reason: "NO_STORE_RECORD" });
      continue;
    }

    // si está desactivado para esta tienda → bloquea
    if (storeStock.active !== true) {
      blockedBy.push({ id: ing.id, name: ing.name, reason: "INACTIVE" });
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
