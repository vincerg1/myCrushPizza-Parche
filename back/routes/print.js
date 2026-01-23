// back/routes/print.js
const express = require("express");
const router = express.Router();

router.post("/print-ticket", (req, res) => {
  const { ticket, orderId } = req.body;

  if (!ticket) {
    return res.status(400).json({ error: "Ticket vacío" });
  }

  console.log("=== TICKET RECIBIDO ===");
  console.log(ticket);

  // ⏭️ aquí irá la impresión real
  res.json({ ok: true });
});

module.exports = router;
