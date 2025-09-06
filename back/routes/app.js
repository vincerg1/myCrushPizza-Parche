// back/routes/app.js
const express = require('express');
const auth    = require('../middleware/auth'); // ← usa la factory

module.exports = (prisma) => {
  const router = express.Router();

  // GET público: si no existe la tabla, devolvemos abierto por defecto
  router.get('/status', async (_req, res) => {
    try {
      const meta = await prisma.appMeta.findUnique({
        where: { id: 1 },
        select: { acceptingOrders: true, closedMessage: true },
      });
      res.json({
        accepting: meta?.acceptingOrders ?? true,
        message  : meta?.closedMessage || '',
      });
    } catch (e) {
      if (e?.code === 'P2021') {
        console.warn('[app/status] AppMeta no migrada. Devolviendo abierto por defecto.');
        return res.json({ accepting: true, message: '' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH protegido: SOLO admin
  router.patch('/status', auth(['admin']), async (req, res) => {
    try {
      const data = {};
      if (typeof req.body.accepting === 'boolean') data.acceptingOrders = req.body.accepting;
      if (typeof req.body.message   === 'string')  data.closedMessage   = req.body.message;

      const saved = await prisma.appMeta.upsert({
        where : { id: 1 },
        update: data,
        create: {
          id: 1,
          acceptingOrders: data.acceptingOrders ?? true,
          closedMessage  : data.closedMessage || '',
        },
        select: { acceptingOrders: true, closedMessage: true },
      });

      res.json({ accepting: saved.acceptingOrders, message: saved.closedMessage || '' });
    } catch (e) {
      if (e?.code === 'P2021') {
        return res.status(500).json({ error: 'Falta migrar AppMeta. Ejecuta prisma migrate.' });
      }
      res.status(400).json({ error: e.message || 'error' });
    }
  });

  return router;
};
