const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.use(cors()); // you can restrict origin by passing options to cors()
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per windowMs
});
app.use('/api/', limiter);

const ONENET_DEVICE_ID = process.env.ONENET_DEVICE_ID;
const ONENET_ACCESS_KEY = process.env.ONENET_ACCESS_KEY;
// Default header name changed to access_key per your request
const ONENET_KEY_NAME = process.env.ONENET_KEY_NAME || 'access_key';
const SECRET_TOKEN = process.env.SECRET_TOKEN; // optional simple auth for browser requests

if (!ONENET_DEVICE_ID || !ONENET_ACCESS_KEY) {
  console.error('Please set ONENET_DEVICE_ID and ONENET_ACCESS_KEY in environment');
  process.exit(1);
}

app.post('/api/log-nav', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' });

  // Optional simple token check to avoid anonymous misuse
  if (SECRET_TOKEN) {
    const token = req.headers['x-secret'] || req.headers['x-forwarded-secret'];
    if (!token || token !== SECRET_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  }

  const onenetUrl = `https://api.heclouds.com/devices/${ONENET_DEVICE_ID}/datapoints?type=1`;
  const body = {
    datastreams: [
      {
        id: 'nav_text',
        datapoints: [{ value: text }],
      },
    ],
  };

  try {
    const resp = await axios.post(onenetUrl, body, {
      headers: {
        'Content-Type': 'application/json',
        [ONENET_KEY_NAME]: ONENET_ACCESS_KEY,
      },
      timeout: 5000,
    });
    return res.status(200).json({ ok: true, onenet: resp.data });
  } catch (err) {
    console.error('OneNet forward error:', err.response?.data || err.message);
    return res.status(502).json({ error: 'forward_failed', details: err.response?.data || err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`OneNet proxy listening on ${port}`));
