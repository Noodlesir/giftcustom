'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');

const { generateThemes } = require('./lib/themes');
const { createOrder, getOrder } = require('./lib/orders');

const app = express();
const PORT = process.env.PORT || 3000;

// No cors() here on purpose: server.js serves public/ itself, so the
// frontend and API are always same-origin (see README). Enabling CORS would
// let any third-party page trigger paid AI calls and disk writes from a
// visitor's browser for no benefit to this app.
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------------ */
/* Rate limiting                                                        */
/* /api/themes calls a paid Anthropic API per request; /api/orders and   */
/* the order-lookup route write/read PII (name + delivery address) with  */
/* no authentication. Both need a ceiling against scripted abuse.        */
/* ------------------------------------------------------------------ */
const themesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many theme requests — please wait a few minutes and try again.' },
});
const ordersLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many order requests — please wait a few minutes and try again.' },
});
// Order lookup is unauthenticated and IDs are guessable in bulk (timestamp +
// short random suffix); a tighter limit makes brute-forcing other people's
// orders impractical without breaking normal "check my order" usage.
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many lookup requests — please wait a few minutes and try again.' },
});

/* ------------------------------------------------------------------ */
/* API routes                                                          */
/* ------------------------------------------------------------------ */

// POST /api/themes  -> generate AI theme ideas for the recipient/occasion/budget
app.post('/api/themes', themesLimiter, async (req, res) => {
  try {
    const { themes, source } = await generateThemes(req.body);
    res.json({ themes, source });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Failed to generate themes' });
  }
});

// POST /api/orders  -> confirm and persist a gift order
app.post('/api/orders', ordersLimiter, async (req, res) => {
  try {
    const order = await createOrder(req.body);
    res.status(201).json(order);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Failed to create order' });
  }
});

// GET /api/orders/:orderId  -> look up an existing order (e.g. confirmation page reload)
app.get('/api/orders/:orderId', lookupLimiter, async (req, res) => {
  try {
    const order = await getOrder(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to look up order' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.listen(PORT, () => {
  console.log(`GiftCustom server running at http://localhost:${PORT}`);
  console.log(process.env.ANTHROPIC_API_KEY
    ? 'AI theme generation: enabled'
    : 'AI theme generation: disabled (no ANTHROPIC_API_KEY set) — using deterministic fallback');
});
