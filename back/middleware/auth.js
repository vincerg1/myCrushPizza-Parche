// middleware/auth.js
const jwt    = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'devsecret';

module.exports = (roles = []) => {
  const needRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    const hdr = String(req.headers.authorization || '');
    if (!hdr.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ error: 'No token' });
    }

    const token = hdr.slice(7).trim();

    try {
      const payload = jwt.verify(token, SECRET);
      console.log('[AUTH] OK →', payload);
      req.user = payload;

      if (needRoles.length && !needRoles.includes(payload.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return next();
    } catch (err) {
      console.error('[AUTH] token error →', err.message);
      return res.status(401).json({ error: 'token invalid' });
    }
  };
};
