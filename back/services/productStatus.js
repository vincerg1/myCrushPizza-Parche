/**
 * Calcula el estado derivado de un producto (pizza, bebida, complemento, etc.)
 * a partir del estado de sus ingredientes.
 *
 * REGLA:
 * - Si TODOS los ingredientes están ACTIVE → producto AVAILABLE
 * - Si ALGUNO está INACTIVE → producto NOT AVAILABLE
 *
 * El producto NO tiene status propio.
 */

/**
 * @param {Array} productIngredients
 *  Array de ingredientes del producto.
 *  Puede ser:
 *   - [{ id, name, status }]
 *   - [{ ingredientId, ingredient: { id, name, status } }]
 *
 * @returns {{
 *   available: boolean,
 *   blockedBy: Array<{ id: number, name: string }>
 * }}
 */
function computeProductStatus(productIngredients = []) {
  if (!Array.isArray(productIngredients) || productIngredients.length === 0) {
    // Producto sin ingredientes → disponible (ej: bebidas simples)
    return {
      available: true,
      blockedBy: [],
    };
  }

  const blockedBy = [];

  for (const item of productIngredients) {
    const ingredient =
      item.ingredient ?? item; // soporta ambas estructuras

    if (!ingredient) continue;

    const status = ingredient.status ?? "ACTIVE";

    if (status === "INACTIVE") {
      blockedBy.push({
        id: ingredient.id,
        name: ingredient.name,
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
