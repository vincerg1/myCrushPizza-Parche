// middleware/auth.js
const jwt    = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'devsecret';

module.exports = (roles = []) => (req, res, next) => {
  const hdr =  req.headers.authorization;

  if (!hdr.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }

  const token = hdr.slice(7);

  try {
    const payload = jwt.verify(token, SECRET);   // ← aquí puede fallar
    console.log('[AUTH] OK →', payload);         // ① LOG
    req.user = payload;

    if (roles.length && !roles.includes(payload.role))
      return res.status(403).json({ error: 'Forbidden' });

    return next();

  } catch (err) {
    console.error('[AUTH] token error →', err.message);   // ② LOG
    return res.status(401).json({ error: 'token invalid' });
  }
};
