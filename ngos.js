'use strict';

const { collection } = require('../store');
const { requireRole, requireAuth } = require('../middleware/auth');
const {
  generateId,
  nowIso,
  hashPassword,
  ok,
  fail,
  requireFields,
  sanitizeString,
} = require('../utils');
const { publicAccount } = require('./auth');

const VALID_STATUSES = ['pending', 'verified', 'suspended'];

/**
 * POST /api/ngos
 * Public registration. New NGOs always start "pending" until an
 * administrator verifies them - matches the "NGO Verification" copy
 * already in the frontend.
 */
async function create(req, res, body) {
  const missing = requireFields(body, ['orgName', 'email', 'city']);
  if (missing.length) return fail(res, 400, `Missing fields: ${missing.join(', ')}`);

  const existing = collection('ngos').find(
    (n) => n.email.toLowerCase() === String(body.email).toLowerCase()
  );
  if (existing) return fail(res, 409, 'An NGO with this email already exists.');

  const password = body.password && String(body.password).length >= 6
    ? body.password
    : require('crypto').randomBytes(9).toString('base64url');

  const ngo = collection('ngos').insert({
    id: generateId(),
    role: 'ngo',
    orgName: sanitizeString(body.orgName, 150),
    email: String(body.email).toLowerCase(),
    passwordHash: hashPassword(password),
    phone: sanitizeString(body.phone || '', 40),
    city: sanitizeString(body.city, 100),
    services: Array.isArray(body.services) ? body.services.slice(0, 20) : [],
    status: 'pending',
    createdAt: nowIso(),
  });

  ok(res, publicAccount(ngo, 'ngo'), 201);
}

/**
 * GET /api/ngos
 *   ?status=verified
 *   ?city=Springfield
 *   ?service=Water
 */
async function list(req, res, query) {
  let items = collection('ngos').all().map((n) => publicAccount(n, 'ngo'));

  if (query.status) items = items.filter((n) => n.status === query.status);
  if (query.city) {
    const c = query.city.toLowerCase();
    items = items.filter((n) => n.city.toLowerCase().includes(c));
  }
  if (query.service) {
    const s = query.service.toLowerCase();
    items = items.filter((n) => (n.services || []).some((sv) => sv.toLowerCase().includes(s)));
  }

  ok(res, items);
}

async function getOne(req, res, params) {
  const record = collection('ngos').findById(params.id);
  if (!record) return fail(res, 404, 'NGO not found.');
  ok(res, publicAccount(record, 'ngo'));
}

/**
 * PATCH /api/ngos/:id
 * The NGO itself can update its own profile; only an admin can change status.
 */
async function update(req, res, params, body) {
  if (!requireAuth(req, res)) return;

  const isSelf = req.user.role === 'ngo' && req.user.id === params.id;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) {
    return fail(res, 403, 'You can only update your own NGO profile.');
  }

  const record = collection('ngos').findById(params.id);
  if (!record) return fail(res, 404, 'NGO not found.');

  const patch = {};
  if (body.city !== undefined) patch.city = sanitizeString(body.city, 100);
  if (body.phone !== undefined) patch.phone = sanitizeString(body.phone, 40);
  if (body.services !== undefined && Array.isArray(body.services)) patch.services = body.services.slice(0, 20);

  if (body.status !== undefined) {
    if (!isAdmin) return fail(res, 403, 'Only an admin can change verification status.');
    if (!VALID_STATUSES.includes(body.status)) {
      return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    patch.status = body.status;
  }

  const updated = collection('ngos').updateById(params.id, patch);
  ok(res, publicAccount(updated, 'ngo'));
}

/**
 * PATCH /api/ngos/:id/verify  { status: "verified" | "suspended" | "pending" }
 * Convenience admin-only endpoint mirroring the "NGO Verification" flow.
 */
async function verify(req, res, params, body) {
  if (!requireRole(req, res, 'admin')) return;

  const status = body.status;
  if (!VALID_STATUSES.includes(status)) {
    return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const record = collection('ngos').findById(params.id);
  if (!record) return fail(res, 404, 'NGO not found.');

  const updated = collection('ngos').updateById(params.id, { status });
  ok(res, publicAccount(updated, 'ngo'));
}

async function remove(req, res, params) {
  if (!requireRole(req, res, 'admin')) return;
  const deleted = collection('ngos').deleteById(params.id);
  if (!deleted) return fail(res, 404, 'NGO not found.');
  ok(res, { id: params.id, deleted: true });
}

module.exports = { create, list, getOne, update, verify, remove, VALID_STATUSES };
