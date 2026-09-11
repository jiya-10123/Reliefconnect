'use strict';

const { collection } = require('../store');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  generateId,
  nowIso,
  ok,
  fail,
  requireFields,
  sanitizeString,
} = require('../utils');

const VALID_TYPES = ['water', 'food', 'medical', 'shelter', 'clothing', 'transport', 'other'];

/**
 * POST /api/resources
 * An NGO (or admin) adds relief inventory it can offer.
 */
async function create(req, res, body) {
  if (!requireRole(req, res, 'ngo', 'admin')) return;

  const ngoId = req.user.role === 'ngo' ? req.user.id : body.ngoId;
  if (!ngoId) return fail(res, 400, 'ngoId is required when creating a resource as an admin.');

  const ngo = collection('ngos').findById(ngoId);
  if (!ngo) return fail(res, 400, 'ngoId does not match a known NGO.');

  const missing = requireFields(body, ['type', 'quantity']);
  if (missing.length) return fail(res, 400, `Missing fields: ${missing.join(', ')}`);

  if (!VALID_TYPES.includes(body.type)) {
    return fail(res, 400, `type must be one of: ${VALID_TYPES.join(', ')}`);
  }

  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return fail(res, 400, 'quantity must be a non-negative number.');
  }

  const record = collection('resources').insert({
    id: generateId(),
    ngoId,
    type: body.type,
    quantity,
    unit: sanitizeString(body.unit || '', 30),
    location: sanitizeString(body.location || '', 200),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  ok(res, record, 201);
}

/**
 * GET /api/resources
 *   ?type=water
 *   ?ngoId=...
 */
async function list(req, res, query) {
  let items = collection('resources').all();

  if (query.type) items = items.filter((r) => r.type === query.type);
  if (query.ngoId) items = items.filter((r) => r.ngoId === query.ngoId);

  ok(res, items);
}

/**
 * GET /api/resources/summary
 * Aggregated totals per resource type - powers the "Available Resources"
 * cards on the homepage (Water / Food / Medical Kits / Shelter / ...).
 */
async function summary(req, res) {
  const items = collection('resources').all();
  const totals = {};
  for (const type of VALID_TYPES) totals[type] = 0;
  for (const item of items) {
    totals[item.type] = (totals[item.type] || 0) + item.quantity;
  }
  ok(res, totals);
}

async function getOne(req, res, params) {
  const record = collection('resources').findById(params.id);
  if (!record) return fail(res, 404, 'Resource not found.');
  ok(res, record);
}

async function update(req, res, params, body) {
  if (!requireAuth(req, res)) return;

  const record = collection('resources').findById(params.id);
  if (!record) return fail(res, 404, 'Resource not found.');

  const isOwner = req.user.role === 'ngo' && req.user.id === record.ngoId;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return fail(res, 403, 'You can only update your own NGO resources.');

  const patch = { updatedAt: nowIso() };
  if (body.quantity !== undefined) {
    const q = Number(body.quantity);
    if (!Number.isFinite(q) || q < 0) return fail(res, 400, 'quantity must be a non-negative number.');
    patch.quantity = q;
  }
  if (body.unit !== undefined) patch.unit = sanitizeString(body.unit, 30);
  if (body.location !== undefined) patch.location = sanitizeString(body.location, 200);
  if (body.type !== undefined) {
    if (!VALID_TYPES.includes(body.type)) return fail(res, 400, `type must be one of: ${VALID_TYPES.join(', ')}`);
    patch.type = body.type;
  }

  const updated = collection('resources').updateById(params.id, patch);
  ok(res, updated);
}

async function remove(req, res, params) {
  if (!requireAuth(req, res)) return;

  const record = collection('resources').findById(params.id);
  if (!record) return fail(res, 404, 'Resource not found.');

  const isOwner = req.user.role === 'ngo' && req.user.id === record.ngoId;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return fail(res, 403, 'You can only delete your own NGO resources.');

  collection('resources').deleteById(params.id);
  ok(res, { id: params.id, deleted: true });
}

module.exports = { create, list, summary, getOne, update, remove, VALID_TYPES };
