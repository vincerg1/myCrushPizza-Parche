const express = require('express');

module.exports = (prisma) => {
  const router = express.Router();

  // detectar middleware de auth sin romper si exporta distinto
  let authMw = null;
  try {
    const mod = require('../middleware/auth'); // ajusta si tu ruta es otra
    authMw = (typeof mod === 'function') ? mod : (mod && typeof mod.auth === 'function') ? mod.auth : null;
  } catch {}
  const protect = (req, res, next) => {
    if (!authMw) return res.status(500).json({ error: 'Auth middleware no disponible' });
    return authMw(req, res, next);
  };

  // GET público: si la tabla no existe, devolvemos "abierto"
  router.get('/status', async (_req, res) => {
    try {
      const meta = await prisma.appMeta.findUnique({
        where: { id: 1 },
        select: { acceptingOrders: true, closedMessage: true }
      });
      res.json({
        accepting: meta?.acceptingOrders ?? true,
        message  : meta?.closedMessage || ''
      });
    } catch (e) {
      // Prisma P2021 = tabla no existe (no migrado)
      const code = e?.code || '';
      if (code === 'P2021') {
        console.warn('[app/status] AppMeta no migrada aún. Devolviendo abierto por defecto.');
        return res.json({ accepting: true, message: '' });
      }
      res.status(500).json({ error: e.message });
    }
  });

  // PATCH: solo admin. upsert con id=1
  router.patch('/status', protect, async (req, res) => {
    try {
      if (req?.user?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

      const data = {};
      if (typeof req.body.accepting === 'boolean') data.acceptingOrders = req.body.accepting;
      if (typeof req.body.message   === 'string')  data.closedMessage   = req.body.message;

      const saved = await prisma.appMeta.upsert({
        where : { id: 1 },
        update: data,
        create: {
          id: 1,
          acceptingOrders: data.acceptingOrders ?? true,
          closedMessage  : data.closedMessage || ''
        },
        select: { acceptingOrders: true, closedMessage: true }
      });

      res.json({ accepting: saved.acceptingOrders, message: saved.closedMessage || '' });
    } catch (e) {
      const code = e?.code || '';
      if (code === 'P2021') {
        return res.status(500).json({ error: 'Falta migrar AppMeta. Ejecuta prisma migrate.' });
      }
      // si el token es inválido, lo verás aquí también
      res.status(400).json({ error: e.message || 'error' });
    }
  });

  return router;
};
