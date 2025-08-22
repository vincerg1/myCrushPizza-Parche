// routes/googleProxy.js
'use strict';

const express = require('express');
const axios   = require('axios');

const router  = express.Router();
const GOOGLE  = process.env.GOOGLE_GEOCODING_KEY;

// GET /api/google/geocode?address=... (o ?latlng=lat,lng | ?lat=..&lng=..)
router.get('/geocode', async (req, res) => {
  try {
    if (!GOOGLE) {
      return res.status(503).json({ error: 'GOOGLE_GEOCODING_KEY no configurada' });
    }

    const { address, latlng, lat, lng, region = 'ES' } = req.query;

    let params;
    if (address) {
      params = { address, region, key: GOOGLE };
    } else if (latlng || (lat && lng)) {
      params = { latlng: latlng || `${lat},${lng}`, region, key: GOOGLE };
    } else {
      return res.status(400).json({ error: 'Falta address o latlng' });
    }

    const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', { params });
    res.json(data);
  } catch (err) {
    console.error('[GOOGLE/geocode]', err?.response?.data || err.message);
    res.status(500).json({ error: 'internal' });
  }
});

module.exports = router;
