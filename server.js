'use strict';

// Load .env in local development (Render injects env vars in production, so this is safe)
if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }
}

const express = require('express');
const https   = require('https');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ─── Security: CORS headers (restrict in production if needed) ────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// ─── Serve all static files (index.html, app.js, style.css, etc.) ────────────
app.use(express.static(path.join(__dirname), {
  // Don't serve .env or server.js files directly
  index: 'index.html',
  setHeaders(res, filePath) {
    const blocked = ['.env', 'server.js', 'package.json', '.gitignore'];
    if (blocked.some(f => filePath.endsWith(f))) {
      res.status(403).end();
    }
  },
}));

// ─── OpenAI PROXY ─────────────────────────────────────────────────────────────
// Frontend calls POST /api/ai-predict → this proxies to OpenAI
// The API key NEVER appears in the browser (read from Render env var)
app.post('/api/ai-predict', (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey.startsWith('sk-your-')) {
    return res.status(503).json({
      error: {
        message: 'AI prediction is unavailable: OPENAI_API_KEY not configured on the server. Add it in Render → Environment Variables.',
      },
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
        res.status(502).json({ error: { message: 'Failed to parse OpenAI response.' } });
      }
    });
  });

  proxyReq.on('error', (e) => {
    console.error('[OpenAI proxy error]', e.message);
    res.status(502).json({ error: { message: 'Gateway error: ' + e.message } });
  });

  proxyReq.write(body);
  proxyReq.end();
});

// ─── Health check for Render uptime monitoring ────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ─── Fallback: serve index.html for any unknown route (SPA support) ──────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🏏 Cricket Predictor server running on http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.startsWith('sk-your-')) {
    console.warn('  ⚠  OPENAI_API_KEY not set – AI Predict button will show an error.');
  }
});
