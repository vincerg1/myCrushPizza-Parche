// GET /api/categories
router.get("/categories", async (req, res) => {
  const rows = await prisma.category.findMany({
    orderBy: { position: "asc" },
  });
  res.json(rows);
});
// PATCH /api/categories/order
router.patch("/categories/order", async (req, res) => {
  const { orderedIds } = req.body; // [3,1,2,...]
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "orderedIds required" });

  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.category.update({
        where: { id: Number(id) },
        data: { position: idx },
      })
    )
  );

  res.json({ ok: true });
});
