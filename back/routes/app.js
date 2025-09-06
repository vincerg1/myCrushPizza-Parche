// back/routes/app.js
const express = require('express');

module.exports = (prisma) => {
  const router = express.Router();

  let authMw = null;
  try {
    const mod = require('../middleware/auth');
    authMw = (typeof mod === 'function') ? mod
            : (mod && typeof mod.auth === 'function') ? mod.auth
            : null;
  } catch {}
  const protect = (req, res, next) => {
    if (!authMw) return res.status(500).json({ error: 'Auth middleware no disponible' });
    return authMw(req, res, next);
  };

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
      if (e?.code === 'P2021') return res.json({ accepting: true, message: '' });
      res.status(500).json({ error: e.message });
    }
  });

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
      if (e?.code === 'P2021') return res.status(500).json({ error: 'Falta migrar AppMeta.' });
      res.status(400).json({ error: e.message || 'error' });
    }
  });

  return router;
};
