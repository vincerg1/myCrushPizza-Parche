// routes/auth.js
const express = require('express');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

const ADMIN_USER = 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
const SECRET     = process.env.JWT_SECRET || 'devsecret';

module.exports = prisma => {

  router.post('/login', async (req, res) => {
    try {
      const { user, pass } = req.body;
      console.log('[AUTH] intento login →', user, pass);

      /* ─────────────── ADMIN ─────────────── */
      if (user === ADMIN_USER && pass === ADMIN_PASS) {
        const token = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '8h' });
        return res.json({ token, role: 'admin' });
      }

      /* ─────────────── TIENDA ──────────────
         user = storeName , pass = storeName  */
      if (user && pass && user === pass) {
        // SQLite es case-insensitive ⇒ basta con = user
        const store = await prisma.store.findFirst({
          where: { storeName: user }
        });

        if (!store)
          return res.status(401).json({ error: 'Tienda no encontrada' });

        const payload = {
          role     : 'store',
          storeId  : store.id,
          storeName: store.storeName
        };
        const token = jwt.sign(payload, SECRET, { expiresIn: '8h' });
        return res.json({ token, ...payload });
      }

      /* ─────────────── KO ────────────────── */
      res.status(401).json({ error: 'Credenciales inválidas' });

    } catch (err) {
      console.error('[AUTH] error inesperado:', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  return router;
};
