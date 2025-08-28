// back/routes/notify.js
const express = require('express');
const { sendSms } = require('../lib/sms');

module.exports = () => {
  const router = express.Router();

  router.get('/ping', (_, res) => res.json({ ok: true }));

  router.post('/sms', async (req, res) => {
    try {
      const { to, body } = req.body || {};
      const msg = await sendSms({ to, body });
      return res.json({ ok: true, sid: msg.sid, status: msg.status });
    } catch (err) {
      console.error('[twilio] error:', {
        message: err.message,
        code: err.code,
        moreInfo: err.moreInfo
      });
      return res.status(500).json({
        ok: false,
        error: err.message,
        code: err.code,
        moreInfo: err.moreInfo
      });
    }
  });

  return router;
};
