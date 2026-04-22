const express = require('express');
const https   = require('https');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve all static files (index.html, app.js, style.css, etc.)
app.use(express.static(path.join(__dirname)));

// ============================================================
// OpenAI PROXY  — reads key from environment variable
// Frontend calls /api/ai-predict  →  this proxies to OpenAI
// The API key never appears in the browser
// ============================================================
app.post('/api/ai-predict', (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'OPENAI_API_KEY environment variable is not set on the server.' }
    });
  }

  const body = JSON.stringify(req.body);

  const options = {
    hostname: 'api.openai.com',
    path:     '/v1/chat/completions',
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Authorization':  'Bearer ' + apiKey,
      'Content-Length': Buffer.byteLength(body),
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', (chunk) => { data += chunk; });
    proxyRes.on('end', () => {
      try {
        res.status(proxyRes.statusCode).json(JSON.parse(data));
      } catch (e) {
        res.status(500).json({ error: { message: 'Failed to parse OpenAI response.' } });
      }
    });
  });

  proxyReq.on('error', (e) => {
    res.status(500).json({ error: { message: e.message } });
  });

  proxyReq.write(body);
  proxyReq.end();
});

// Fallback: serve index.html for any unknown route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Cricket Predictor server running on port ${PORT}`);
});
