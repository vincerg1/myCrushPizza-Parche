// index.js
require('dotenv').config();
require('./cron/updateDaysOff');

const express = require('express');
const cors    = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

/* ========= Opciones de despliegue ========= */
app.set('trust proxy', 1); // necesario si hay proxy (ngrok, render, fly, etc.)

/* ========= CORS (dominios permitidos) ========= */
const FRONT_BASE_URL = process.env.FRONT_BASE_URL || 'http://localhost:3000';
const ALLOWED = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (!ALLOWED.length) {
  ALLOWED.push(FRONT_BASE_URL, 'http://localhost:3000', 'http://127.0.0.1:3000');
}

app.use(cors({
  origin(origin, cb) {
    // permitir llamadas server-to-server (sin origin)
    if (!origin) return cb(null, true);
    if (ALLOWED.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));

/* ========= Body parsing =========
 * ⚠️ MUY IMPORTANTE: NO parsear JSON del webhook de Stripe.
 * Este bypass debe ir ANTES de cualquier express.json()
 */
app.use((req, res, next) => {
  if (req.originalUrl && req.originalUrl.startsWith('/api/venta/stripe/webhook')) {
    return next(); // el router de venta usa express.raw() para este endpoint
  }
  return express.json({ limit: '1mb' })(req, res, next);
});

/* ========= Routers ========= */
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
const ventaRouter           = require('./routes/venta')(prisma);
const couponsRouter         = require('./routes/coupons')(prisma);
const notifyRouter          = require('./routes/notify')(prisma);

const appRouter = require('./routes/app')(prisma);

/* Montaje */
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
app.use('/api/public',          publicRoutes);
app.use('/api/venta',           ventaRouter);
app.use('/api/coupons',         couponsRouter);
app.use('/api/notify',          notifyRouter);
app.use('/api/app',             appRouter);


/* === Twilio Status Callback (usar la MISMA ruta que en el env) ===
   TWILIO_STATUS_CALLBACK_URL = https://mycrushpizza-parche-production.up.railway.app/twilio/status-callback
   Debe ir ANTES del 404. Twilio envía application/x-www-form-urlencoded. */
app.post(
  '/twilio/status-callback',
  express.urlencoded({ extended: false }),
  (req, res) => {
    const {
      MessageSid,
      MessageStatus,
      To,
      From,
      ErrorCode,
      ErrorMessage
    } = req.body || {};

    console.log('[Twilio Status]', {
      MessageSid,
      MessageStatus,
      To,
      From,
      ErrorCode,
      ErrorMessage
    });

    // Aquí podrías persistir en BD si lo necesitas
    res.sendStatus(200);
  }
);

/* Ruta base */
app.get('/', (_, res) => {
  res.send('🚀 API de myCrushPizza funcionando correctamente');
});

/* Ganadores (promo) */
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

/* 404 y errores genéricos (último) */
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

/* Arranque */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('⚙️ DATABASE_URL =', process.env.DATABASE_URL);
  console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`);
});
