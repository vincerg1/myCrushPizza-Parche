// index.js
require('dotenv').config();
require('./cron/updateDaysOff');

console.log('⚙️ DATABASE_URL =', process.env.DATABASE_URL);
console.log('🔍 DATABASE_URL: ', JSON.stringify(process.env.DATABASE_URL));

const express = require('express');
const cors    = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

/* Routers */
const pizzasRouter          = require('./routes/pizzas')(prisma);
const ingredientsRouter     = require('./routes/ingredients')(prisma);
const storesRouter          = require('./routes/stores')(prisma);
const stockRouter           = require('./routes/stock')(prisma);
const authRouter            = require('./routes/auth')(prisma);
const customersRouter       = require('./routes/customers')(prisma);
const salesRouter           = require('./routes/sales')(prisma);
const menuDisponibleRouter  = require('./routes/menuDisponible')(prisma);
const googleRouter          = require('./routes/googleProxy');
const publicRoutes          = require('./routes/public')(prisma);
const venta                 = require('./routes/venta')(prisma);
const couponsRouter         = require('./routes/coupons')(prisma);

/* ───────── Middlewares en el orden correcto ───────── */
app.use(cors());

// ⚠️ MUY IMPORTANTE: NO parsear JSON del webhook de Stripe.
// Este bypass debe ir ANTES de cualquier express.json()
app.use((req, res, next) => {
  if (req.originalUrl === '/api/venta/stripe/webhook') return next();
  return express.json()(req, res, next);
});

/* ───────── Rutas ───────── */
app.use('/api/pizzas',          pizzasRouter);
app.use('/api/menu_pizzas',     pizzasRouter);
app.use('/api/ingredients',     ingredientsRouter);
app.use('/api/stores',          storesRouter);
app.use('/api/stock',           stockRouter);
app.use('/api/auth',            authRouter);
app.use('/api/customers',       customersRouter);
app.use('/api/sales',           salesRouter);
app.use('/api/menuDisponible',  menuDisponibleRouter);
app.use('/api/google',          googleRouter);
app.use('/api/public',          publicRoutes);   // ⬅️ montado una sola vez
app.use('/api/venta',           venta);
app.use('/api/coupons', couponsRouter);
/* Ruta base */
app.get('/', (_, res) => {
  res.send('🚀 API de myCrushPizza funcionando correctamente');
});

/* Ganadores (lo de tu promo) */
app.get('/ganadores', async (_, res) => {
  try {
    const ganadores = await prisma.ganador.findMany({ orderBy: { id: 'desc' } });
    res.json(ganadores);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener ganadores' });
  }
});

app.post('/ganadores', async (_, res) => {
  const numero = Math.floor(Math.random() * 900) + 100;
  try {
    const nuevo = await prisma.ganador.create({ data: { numero } });
    res.json({ message: 'Ganador creado 🎉', ganador: nuevo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear ganador' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
});
