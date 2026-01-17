/**
 * Calcula el estado derivado de un producto
 * combinando reglas GLOBAL + POR TIENDA
 *
 * JERARQUÍA:
 * 1️⃣ Ingredient.status === INACTIVE  → bloquea GLOBALMENTE
 * 2️⃣ StoreIngredientStock.active === false → bloquea SOLO esa tienda
 *
 * NOTA:
 * - Esta función YA NO decide por sí sola si la pizza es ACTIVE/INACTIVE global
 * - SOLO calcula disponibilidad OPERATIVA para una tienda concreta
 */
function computeProductStatus(menuPizzaIngredients = []) {
  if (!Array.isArray(menuPizzaIngredients) || menuPizzaIngredients.length === 0) {
    return { available: true, blockedBy: [] };
  }

  const blockedBy = [];

  for (const row of menuPizzaIngredients) {
    const ing = row.ingredient;
    const storeStock = ing?.storeStocks?.[0];

    // 1️⃣ Regla GLOBAL (admin)
    if (ing?.status !== "ACTIVE") {
      blockedBy.push({
        id: ing.id,
        name: ing.name,
        reason: "GLOBAL_INACTIVE",
      });
      continue;
    }

    // 2️⃣ Regla POR TIENDA (operativa)
    if (!storeStock) {
      blockedBy.push({
        id: ing.id,
        name: ing.name,
        reason: "NO_STORE_RECORD",
      });
      continue;
    }

    if (storeStock.active !== true) {
      blockedBy.push({
        id: ing.id,
        name: ing.name,
        reason: "STORE_INACTIVE",
      });
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
