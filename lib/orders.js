'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'orders.json');

// Simple in-process write queue so concurrent requests don't clobber the file.
let writeQueue = Promise.resolve();

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, '{}', 'utf8');
  }
}

async function readAll() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function generateOrderId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `GC-${stamp}-${rand}`;
}

function sanitizeString(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function validateOrder(body) {
  const errors = [];
  const out = {};

  out.recipientName = sanitizeString(body.recipientName, 80);
  if (!out.recipientName) errors.push('recipientName is required');

  out.relationship = sanitizeString(body.relationship, 40);
  out.deliveryAddress = sanitizeString(body.deliveryAddress, 300);
  if (!out.deliveryAddress) errors.push('deliveryAddress is required');

  out.occasion = sanitizeString(body.occasion, 30);
  out.notes = sanitizeString(body.notes, 300);
  out.currency = sanitizeString(body.currency, 6) || 'INR';

  out.budget = Number(body.budget);
  if (!Number.isFinite(out.budget) || out.budget <= 0) errors.push('budget must be a positive number');

  out.giftTypes = Array.isArray(body.giftTypes) ? body.giftTypes.map((g) => sanitizeString(g, 30)).filter(Boolean) : [];

  const theme = body.selectedTheme && typeof body.selectedTheme === 'object' ? body.selectedTheme : null;
  out.selectedTheme = theme
    ? {
        name: sanitizeString(theme.name, 60),
        concept: sanitizeString(theme.concept, 300),
        palette: sanitizeString(theme.palette, 60),
        items: sanitizeString(theme.items, 150),
        totalPrice: Number.isFinite(Number(theme.totalPrice)) ? Number(theme.totalPrice) : out.budget,
      }
    : null;

  return { out, errors };
}

async function createOrder(body) {
  const { out, errors } = validateOrder(body);
  if (errors.length) {
    const err = new Error(errors.join('; '));
    err.status = 400;
    throw err;
  }

  const order = {
    orderId: generateOrderId(),
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    ...out,
  };

  writeQueue = writeQueue.then(async () => {
    const all = await readAll();
    all[order.orderId] = order;
    await fs.writeFile(DATA_FILE, JSON.stringify(all, null, 2), 'utf8');
  });
  await writeQueue;

  return order;
}

async function getOrder(orderId) {
  const all = await readAll();
  return all[orderId] || null;
}

module.exports = { createOrder, getOrder };
