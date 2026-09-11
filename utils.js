'use strict';

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'reliefconnect-super-secret-change-me';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/* ============================================================
   IDs
============================================================ */
function generateId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

/* ============================================================
   Password hashing (scrypt, core "crypto" module - no bcrypt needed)
============================================================ */
function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plainPassword), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(plainPassword, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const derived = crypto.scryptSync(String(plainPassword), salt, 64);
  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derived);
}

/* ============================================================
   Minimal JWT-style signed tokens (HMAC-SHA256).
   No external "jsonwebtoken" dependency required.
============================================================ */
function base64url(input) {
  return Buffer.from(JSON.stringify(input))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
}

function sign(payload, ttlSeconds = TOKEN_TTL_SECONDS) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const fullPayload = { ...payload, iat, exp };

  const headerPart = base64url(header);
  const payloadPart = base64url(fullPayload);
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${headerPart}.${payloadPart}.${signature}`;
}

function verify(token) {
  try {
    const [headerPart, payloadPart, signature] = token.split('.');
    if (!headerPart || !payloadPart || !signature) return null;

    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerPart}.${payloadPart}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const sigBuffer = Buffer.from(signature);
    const expBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expBuffer)) return null;

    const payload = base64urlDecode(payloadPart);
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;

    return payload;
  } catch (err) {
    return null;
  }
}

/* ============================================================
   Priority scoring - mirrors the demo logic already shipped in
   the frontend (calculatePriority in 123.html) so scores stay
   consistent between what the UI previously simulated and what
   the backend now computes for real.
============================================================ */
const TYPE_SCORES = {
  rescue: 100,
  medical: 90,
  shelter: 70,
  water: 60,
  food: 50,
  clothing: 40,
  other: 30,
};

const URGENCY_SCORES = {
  emergency: 50,
  high: 25,
  normal: 0,
};

function calculatePriority(type, peopleAffected, urgency) {
  const base = TYPE_SCORES[type] ?? 30;
  const peopleScore = Number(peopleAffected || 0) * 5;
  const urgencyScore = URGENCY_SCORES[urgency] ?? 0;
  return base + peopleScore + urgencyScore;
}

function priorityLabel(urgency) {
  if (urgency === 'emergency') return 'emergency';
  if (urgency === 'high') return 'high';
  return 'normal';
}

/* ============================================================
   HTTP response / body helpers
============================================================ */
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function ok(res, data, statusCode = 200) {
  sendJson(res, statusCode, { success: true, data });
}

function fail(res, statusCode, message, details) {
  sendJson(res, statusCode, {
    success: false,
    error: message,
    ...(details ? { details } : {}),
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    const MAX_BYTES = 2 * 1024 * 1024; // 2MB safety cap

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

/* ============================================================
   Simple validation helper
============================================================ */
function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || v === '';
  });
  return missing;
}

function sanitizeString(value, maxLen = 2000) {
  if (typeof value !== 'string') return value;
  return value.trim().slice(0, maxLen);
}

module.exports = {
  generateId,
  nowIso,
  hashPassword,
  verifyPassword,
  sign,
  verify,
  calculatePriority,
  priorityLabel,
  TYPE_SCORES,
  URGENCY_SCORES,
  sendJson,
  ok,
  fail,
  readBody,
  requireFields,
  sanitizeString,
};
