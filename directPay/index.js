const express = require("express");
const cors = require("cors");
const { nanoid } = require("nanoid");

const app = express();

const PORT = process.env.PORT || 8080;
const BASE_URL = process.env.SHORT_BASE_URL || "https://pay.mycrushpizza.com";

// Mapa en memoria: NO BD, NO registros permanentes
const links = new Map();

app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.json({ ok: true, service: "directPay shortener" });
});

// Crear link corto
app.post("/api/shorten", (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url requerida" });
  }

  // Opcional: solo permitir Stripe Checkout
  if (!url.startsWith("https://checkout.stripe.com/")) {
    return res.status(400).json({ error: "solo se permiten URLs de Stripe Checkout" });
  }

  let code = nanoid(7);
  while (links.has(code)) {
    code = nanoid(7);
  }

  links.set(code, url);

  const shortUrl = `${BASE_URL}/${code}`;
  res.json({ code, shortUrl });
});

// Redirigir
app.get("/:code", (req, res) => {
  const { code } = req.params;
  const target = links.get(code);

  if (!target) {
    return res.status(404).send("Link no encontrado o expirado");
  }

  return res.redirect(302, target);
});

app.listen(PORT, () => {
  console.log(`directPay shortener escuchando en puerto ${PORT}`);
});
