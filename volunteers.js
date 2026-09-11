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

/**
 * POST /api/volunteers
 * Public - mirrors the "Become a Volunteer" modal form (#volunteerForm).
 * A password is optional here: if omitted, a random one is generated so
 * the volunteer still has an account they can claim later via
 * "forgot password" style flow, without forcing a password field into
 * the existing frontend modal.
 */
async function create(req, res, body) {
  const missing = requireFields(body, ['name', 'email', 'city']);
  if (missing.length) return fail(res, 400, `Missing fields: ${missing.join(', ')}`);

  const existing = collection('volunteers').find(
    (v) => v.email.toLowerCase() === String(body.email).toLowerCase()
  );
  if (existing) return fail(res, 409, 'A volunteer with this email already exists.');

  const password = body.password && String(body.password).length >= 6
    ? body.password
    : require('crypto').randomBytes(9).toString('base64url');

  const volunteer = collection('volunteers').insert({
    id: generateId(),
    role: 'volunteer',
    name: sanitizeString(body.name, 150),
    email: String(body.email).toLowerCase(),
    passwordHash: hashPassword(password),
    phone: sanitizeString(body.phone || '', 40),
    city: sanitizeString(body.city, 100),
    skills: Array.isArray(body.skills)
      ? body.skills.slice(0, 20)
      : (body.skills ? [sanitizeString(body.skills, 100)] : []),
    available: true,
    createdAt: nowIso(),
  });

  ok(res, publicAccount(volunteer, 'volunteer'), 201);
}

/**
 * GET /api/volunteers
 *   ?available=true
 *   ?skill=First Aid
 *   ?city=Springfield
 */
async function list(req, res, query) {
  let items = collection('volunteers').all().map((v) => publicAccount(v, 'volunteer'));

  if (query.available !== undefined) {
    const wantAvailable = query.available === 'true';
    items = items.filter((v) => v.available === wantAvailable);
  }
  if (query.skill) {
    const s = query.skill.toLowerCase();
    items = items.filter((v) => (v.skills || []).some((sk) => sk.toLowerCase().includes(s)));
  }
  if (query.city) {
    const c = query.city.toLowerCase();
    items = items.filter((v) => v.city.toLowerCase().includes(c));
  }

  ok(res, items);
}

async function getOne(req, res, params) {
  const record = collection('volunteers').findById(params.id);
  if (!record) return fail(res, 404, 'Volunteer not found.');
  ok(res, publicAccount(record, 'volunteer'));
}

/**
 * PATCH /api/volunteers/:id
 * The volunteer themself or an admin can update availability/skills.
 */
async function update(req, res, params, body) {
  if (!requireAuth(req, res)) return;

  const isSelf = req.user.role === 'volunteer' && req.user.id === params.id;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) {
    return fail(res, 403, 'You can only update your own volunteer profile.');
  }

  const record = collection('volunteers').findById(params.id);
  if (!record) return fail(res, 404, 'Volunteer not found.');

  const patch = {};
  if (body.available !== undefined) patch.available = Boolean(body.available);
  if (body.skills !== undefined && Array.isArray(body.skills)) patch.skills = body.skills.slice(0, 20);
  if (body.city !== undefined) patch.city = sanitizeString(body.city, 100);
  if (body.phone !== undefined) patch.phone = sanitizeString(body.phone, 40);

  const updated = collection('volunteers').updateById(params.id, patch);
  ok(res, publicAccount(updated, 'volunteer'));
}

async function remove(req, res, params) {
  if (!requireRole(req, res, 'admin')) return;
  const deleted = collection('volunteers').deleteById(params.id);
  if (!deleted) return fail(res, 404, 'Volunteer not found.');
  ok(res, { id: params.id, deleted: true });
}

module.exports = { create, list, getOne, update, remove };
