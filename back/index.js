// index.js
require('dotenv').config();
require("./cron/updateDaysOff");

console.log("⚙️ DATABASE_URL =", process.env.DATABASE_URL);
console.log("🔍 DATABASE_URL: ", JSON.stringify(process.env.DATABASE_URL));
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const app = express();
const prisma = new PrismaClient();
const pizzasRouter = require('./routes/pizzas')(prisma);
const ingredientsRouter = require('./routes/ingredients')(prisma)
const storesRouter     = require('./routes/stores')(prisma);
const stockRouter = require('./routes/stock')(prisma);
const authRouter      = require('./routes/auth')(prisma);
const customersRouter = require('./routes/customers')(prisma);
const salesRouter     = require('./routes/sales')(prisma);
const menuDisponibleRouter = require('./routes/menuDisponible')(prisma);
const googleRouter = require('./routes/googleProxy');
const publicRoutes = require('./routes/public')(prisma);

app.use(cors());
app.use(express.json());
app.use('/api/pizzas', pizzasRouter);
app.use('/api/menu_pizzas', pizzasRouter);
app.use('/api/ingredients', ingredientsRouter)
app.use('/api/stores',     storesRouter);
app.use('/api/stock', stockRouter);
app.use('/api/auth', authRouter); 
app.use('/api/customers', customersRouter);
app.use('/api/sales',     salesRouter);
app.use('/api/menuDisponible', menuDisponibleRouter);  
app.use('/api/google', googleRouter);
app.use("/api/public", require("./routes/public")(prisma));
app.use('/api/public', publicRoutes);


// Ruta base
app.get('/', (_, res) => {
  res.send('🚀 API de myCrushPizza funcionando correctamente');
});

// Obtener todos los ganadores
app.get('/ganadores', async (_, res) => {
  try {
    const ganadores = await prisma.ganador.findMany({
      orderBy: { id: 'desc' },
    });
    res.json(ganadores);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener ganadores' });
  }
});

// Crear nuevo número ganador
app.post('/ganadores', async (_, res) => {
  const numero = Math.floor(Math.random() * 900) + 100;
  try {
    const nuevo = await prisma.ganador.create({
      data: {
        numero,
      },
    });
    res.json({ message: 'Ganador creado 🎉', ganador: nuevo });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear ganador' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`🚀 Servidor backend escuchando en http://localhost:${PORT}`)
);
