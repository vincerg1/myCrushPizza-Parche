// back/routes/notify.js
const express = require('express');
const { sendSMS } = require('../lib/sms');

// plantillas de mensaje
const TPL = {
  welcome:
`Bienvenido(a) a myCrushPizza!
¡En breve te atenderemos! 😊😊

Aquí nuestro menú: https://goo.su/mKsRUJT`,

  iniciar_pedido:
`📲 Para hacer tu pedido entra en el siguiente enlace:
👉 *https://mycrushpizza-parchefront-production.up.railway.app/venta*
Solo tienes que seguir los pasos y ¡listo! 🍕⚡`,

  ready_pickup: `Tu CRUSH ya está esperando por ti..! 🫶🍕`,

  ready_delivery: `Tu CRUSH está lista para salir hacia ti...! ⚡💕`,

  delivered_ok: `¡Pedido entregado!
¡Gracias por confiar en nosotros! ⚡🍕`,
};

module.exports = function notifyRouter(/* prisma, si lo necesitas luego */) {
  const router = express.Router();

  // 1) Envío libre (para pruebas o envíos manuales)
  router.post('/sms', async (req, res) => {
    try {
      const { to, body } = req.body;
      if (!to || !body) {
        return res.status(400).json({ error: '`to` y `body` son requeridos' });
      }
      const msg = await sendSMS({ to, body });
      res.json({ ok: true, sid: msg.sid, status: msg.status });
    } catch (err) {
      console.error('notify/sms error:', err);
      res.status(500).json({ error: 'No se pudo enviar el SMS' });
    }
  });

  // 2) Disparador por evento de pedido
  // body: { phone: string, extra?: {...} }
  // params: :id (id pedido), :event (welcome|iniciar_pedido|ready_pickup|ready_delivery|delivered_ok)
  router.post('/order/:id/:event', async (req, res) => {
    try {
      const { id, event } = req.params;
      const { phone } = req.body;

      if (!phone) return res.status(400).json({ error: 'phone requerido' });
      const body = TPL[event];
      if (!body) return res.status(400).json({ error: 'event inválido' });

      // Aquí podrías leer datos del pedido con prisma si lo necesitas (id)
      // const order = await prisma.sale.findUnique({ where: { id: Number(id) } });

      const msg = await sendSMS({ to: phone, body });
      res.json({ ok: true, sid: msg.sid, status: msg.status });
    } catch (err) {
      console.error('notify/order event error:', err);
      res.status(500).json({ error: 'No se pudo enviar el SMS del evento' });
    }
  });

  return router;
};
