// routes/googleProxy.js
const express = require('express');
const axios   = require('axios');
const router  = express.Router();
const GOOGLE  = process.env.GOOGLE_GEOCODING_KEY;

router.get('/geocode', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address requerido' });

    const url = 'https://maps.googleapis.com/maps/api/geocode/json';
    const { data } = await axios.get(url, {
      params: { address, components: 'country:ES', key: GOOGLE }
    });

    res.json(data);
  } catch (err) {
    console.error('[GOOGLE/geocode]', err);
    res.status(500).json({ error: 'internal' });
  }
});

module.exports = router;
