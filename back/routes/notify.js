// back/routes/notify.js
const express = require('express');
const sendSms = require('../lib/sms');      // ⬅ default export (no destructuring)
const { toE164 } = require('../lib/phone'); // normaliza a E.164 (+34…, etc.)

module.exports = () => {
  const router = express.Router();

  router.get('/ping', (_, res) => res.json({ ok: true }));

  router.post('/sms', async (req, res) => {
    try {
      const { to, body } = req.body || {};

      if (!to || !body) {
        return res.status(400).json({
          ok: false,
          error: 'Parámetros requeridos: to, body'
        });
      }

      // Normaliza a E.164 (por defecto ES -> +34)
      const dest = toE164(to, 'ES');
      if (!dest) {
        return res.status(400).json({ ok: false, error: 'Teléfono inválido' });
      }

      // Firma correcta: sendSms(dest, body)
      const msg = await sendSms(dest, body);

      return res.json({
        ok: true,
        sid: msg.sid,
        status: msg.status,
        to: msg.to
      });
    } catch (err) {
      console.error('[twilio] error:', {
        message: err?.message,
        code: err?.code,
        moreInfo: err?.moreInfo
      });
      return res.status(500).json({
        ok: false,
        error: err?.message || 'Error enviando SMS',
        code: err?.code,
        moreInfo: err?.moreInfo
      });
    }
  });

  return router;
};
