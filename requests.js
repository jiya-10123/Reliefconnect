'use strict';

const { collection } = require('../store');
const { requireRole } = require('../middleware/auth');
const {
  generateId,
  nowIso,
  calculatePriority,
  priorityLabel,
  ok,
  fail,
  requireFields,
  sanitizeString,
} = require('../utils');

const VALID_HELP_TYPES = ['rescue', 'medical', 'food', 'water', 'shelter', 'clothing', 'other'];
const VALID_URGENCY = ['emergency', 'high', 'normal'];
const VALID_STATUSES = ['reported', 'assigned', 'in_progress', 'resolved'];

/**
 * POST /api/requests
 * Public - no login required. This mirrors the "Request Emergency Help"
 * form in the frontend (#helpForm) exactly, field for field.
 */
async function create(req, res, body) {
  const required = [
    'fullName', 'phone', 'helpType', 'urgency',
    'city', 'area', 'address', 'peopleAffected', 'description',
  ];
  const missing = requireFields(body, required);
  if (missing.length) return fail(res, 400, `Missing fields: ${missing.join(', ')}`);

  if (!VALID_HELP_TYPES.includes(body.helpType)) {
    return fail(res, 400, `helpType must be one of: ${VALID_HELP_TYPES.join(', ')}`);
  }
  if (!VALID_URGENCY.includes(body.urgency)) {
    return fail(res, 400, `urgency must be one of: ${VALID_URGENCY.join(', ')}`);
  }

  const peopleAffected = Number(body.peopleAffected);
  if (!Number.isFinite(peopleAffected) || peopleAffected < 1) {
    return fail(res, 400, 'peopleAffected must be a number of at least 1.');
  }

  let latitude = null;
  let longitude = null;
  if (body.latitude !== undefined && body.latitude !== null && body.latitude !== '') {
    latitude = Number(body.latitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return fail(res, 400, 'latitude must be a number between -90 and 90.');
    }
  }
  if (body.longitude !== undefined && body.longitude !== null && body.longitude !== '') {
    longitude = Number(body.longitude);
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return fail(res, 400, 'longitude must be a number between -180 and 180.');
    }
  }

  const priorityScore = calculatePriority(body.helpType, peopleAffected, body.urgency);

  const record = collection('requests').insert({
    id: generateId(),
    fullName: sanitizeString(body.fullName, 150),
    phone: sanitizeString(body.phone, 40),
    helpType: body.helpType,
    urgency: body.urgency,
    city: sanitizeString(body.city, 100),
    area: sanitizeString(body.area, 100),
    address: sanitizeString(body.address, 500),
    peopleAffected,
    latitude,
    longitude,
    description: sanitizeString(body.description, 3000),
    notes: sanitizeString(body.notes || '', 1000),
    priorityScore,
    priorityLabel: priorityLabel(body.urgency),
    status: 'reported',
    assignedVolunteerId: null,
    assignedNgoId: null,
    statusHistory: [{ status: 'reported', at: nowIso() }],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  ok(res, record, 201);
}

/**
 * GET /api/requests
 * Public read access (this is a coordination platform - responders need
 * to see open requests without friction). Supports filtering + sorting.
 *   ?status=reported
 *   ?urgency=emergency
 *   ?helpType=water
 *   ?city=Springfield
 *   ?sort=priority (default) | recent
 *   ?limit=10
 */
async function list(req, res, query) {
  let items = collection('requests').all();

  if (query.status) items = items.filter((r) => r.status === query.status);
  if (query.urgency) items = items.filter((r) => r.urgency === query.urgency);
  if (query.helpType) items = items.filter((r) => r.helpType === query.helpType);
  if (query.city) {
    const c = query.city.toLowerCase();
    items = items.filter((r) => r.city.toLowerCase().includes(c));
  }

  if (query.sort === 'recent') {
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    items.sort((a, b) => b.priorityScore - a.priorityScore);
  }

  const limit = Number(query.limit);
  if (Number.isFinite(limit) && limit > 0) {
    items = items.slice(0, limit);
  }

  ok(res, items);
}

async function getOne(req, res, params) {
  const record = collection('requests').findById(params.id);
  if (!record) return fail(res, 404, 'Request not found.');
  ok(res, record);
}

/**
 * PATCH /api/requests/:id
 * Volunteers, NGOs and admins can update status / assignment.
 * Body may include: status, assignedVolunteerId, assignedNgoId
 */
async function update(req, res, params, body) {
  if (!requireRole(req, res, 'volunteer', 'ngo', 'admin')) return;

  const record = collection('requests').findById(params.id);
  if (!record) return fail(res, 404, 'Request not found.');

  const patch = { updatedAt: nowIso() };

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    patch.status = body.status;
    patch.statusHistory = [...record.statusHistory, { status: body.status, at: nowIso() }];
  }

  if (body.assignedVolunteerId !== undefined) {
    if (body.assignedVolunteerId !== null) {
      const v = collection('volunteers').findById(body.assignedVolunteerId);
      if (!v) return fail(res, 400, 'assignedVolunteerId does not match a known volunteer.');
    }
    patch.assignedVolunteerId = body.assignedVolunteerId;
    if (body.assignedVolunteerId && record.status === 'reported') {
      patch.status = 'assigned';
      patch.statusHistory = [...(patch.statusHistory || record.statusHistory), { status: 'assigned', at: nowIso() }];
    }
  }

  if (body.assignedNgoId !== undefined) {
    if (body.assignedNgoId !== null) {
      const n = collection('ngos').findById(body.assignedNgoId);
      if (!n) return fail(res, 400, 'assignedNgoId does not match a known NGO.');
    }
    patch.assignedNgoId = body.assignedNgoId;
  }

  const updated = collection('requests').updateById(params.id, patch);
  ok(res, updated);
}

/**
 * DELETE /api/requests/:id - admin only (e.g. removing spam/duplicate reports)
 */
async function remove(req, res, params) {
  if (!requireRole(req, res, 'admin')) return;
  const deleted = collection('requests').deleteById(params.id);
  if (!deleted) return fail(res, 404, 'Request not found.');
  ok(res, { id: params.id, deleted: true });
}

module.exports = { create, list, getOne, update, remove, VALID_HELP_TYPES, VALID_URGENCY, VALID_STATUSES };
