// back/routes/menuDisponible.js
const express = require("express");
const { computeProductStatus } = require("../services/productStatusService");

module.exports = (prisma) => {
  const r = express.Router();

  r.get("/:storeId", async (req, res) => {
    try {
      const storeId = Number(req.params.storeId);
      if (!storeId) return res.json([]);

      console.log("➡️ menuDisponible | storeId:", storeId);

      const rows = await prisma.storePizzaStock.findMany({
        where: {
          storeId,
          active: true, // StorePizzaStock
          pizza: {
            status: "ACTIVE", // MenuPizza
          },
        },
        select: {
          pizzaId: true,
          stock: true,
          active: true,
          pizza: {
            select: {
              id: true,
              name: true,
              category: true,
              selectSize: true,
              priceBySize: true,
              image: true,
              status: true,
              ingredients: {
                select: {
                  qtyBySize: true,
                  ingredient: {
                    select: {
                      id: true,
                      name: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { pizzaId: "asc" },
      });

      console.log("📦 rows encontrados:", rows.length);

      const menu = rows
        .map((r) => {
          if (!r?.pizza) return null;

          console.log("🍕 Procesando pizza:", r.pizza.name);

          const ingredientsRaw = Array.isArray(r.pizza.ingredients)
            ? r.pizza.ingredients
            : [];

          console.log(
            "  🧾 Ingredientes RAW:",
            ingredientsRaw.map((i) => ({
              name: i.ingredient?.name,
              status: i.ingredient?.status,
              qtyBySize: i.qtyBySize,
            }))
          );

          // ✅ SOLO ingredientes activos
          const activeIngredients = ingredientsRaw.filter(
            (rel) => rel.ingredient?.status === "ACTIVE"
          );

          console.log(
            "  ✅ Ingredientes ACTIVOS:",
            activeIngredients.map((i) => i.ingredient.name)
          );

          let recipeStatus;
          try {
            recipeStatus = computeProductStatus(activeIngredients);
          } catch (e) {
            console.error("❌ computeProductStatus error:", e);
            return null;
          }

          const hasStock = r.stock == null || Number(r.stock) > 0;

          const available =
            r.active === true &&
            r.pizza.status === "ACTIVE" &&
            recipeStatus?.available === true &&
            hasStock;

          console.log(
            `  📊 status → active:${r.active} recipe:${
              recipeStatus?.available
            } stock:${hasStock} ⇒ AVAILABLE:${available}`
          );

          if (!available) return null;

          const normalizedIngredients = activeIngredients.map((rel) => ({
            id: rel.ingredient.id,
            name: rel.ingredient.name,
            qtyBySize: rel.qtyBySize,
          }));

          console.log(
            "  🧩 Ingredientes enviados al FRONT:",
            normalizedIngredients.map((i) => i.name)
          );

          return {
            pizzaId: r.pizzaId,
            stock: r.stock ?? null, // null = ilimitado
            name: r.pizza.name,
            category: r.pizza.category,
            selectSize: r.pizza.selectSize ?? [],
            priceBySize: r.pizza.priceBySize ?? {},
            image: r.pizza.image ?? null,
            ingredients: normalizedIngredients, // 🔑 CLAVE
            available: true,
          };
        })
        .filter(Boolean);

      console.log("✅ menu final enviado:", menu.length);

      res.json(menu);
    } catch (err) {
      console.error("🔥 menuDisponible error:", err);
      // regla de oro: nunca romper ventas
      res.json([]);
    }
  });

  return r;
};
