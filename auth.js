'use strict';

const { collection, load } = require('../store');
const {
  generateId,
  nowIso,
  hashPassword,
  verifyPassword,
  sign,
  ok,
  fail,
  requireFields,
  sanitizeString,
} = require('../utils');

function findAccountByEmail(email) {
  const db = load();
  const lower = String(email || '').toLowerCase();

  const admin = (db.admins || []).find((a) => a.email.toLowerCase() === lower);
  if (admin) return { account: admin, role: 'admin' };

  const ngo = collection('ngos').find((n) => n.email.toLowerCase() === lower);
  if (ngo) return { account: ngo, role: 'ngo' };

  const volunteer = collection('volunteers').find((v) => v.email.toLowerCase() === lower);
  if (volunteer) return { account: volunteer, role: 'volunteer' };

  return null;
}

function publicAccount(account, role) {
  const { passwordHash, ...rest } = account;
  return { ...rest, role };
}

async function login(req, res, body) {
  const missing = requireFields(body, ['email', 'password']);
  if (missing.length) return fail(res, 400, `Missing fields: ${missing.join(', ')}`);

  const found = findAccountByEmail(body.email);
  if (!found || !verifyPassword(body.password, found.account.passwordHash)) {
    return fail(res, 401, 'Invalid email or password.');
  }

  const { account, role } = found;
  const token = sign({ id: account.id, role, email: account.email });

  ok(res, { token, user: publicAccount(account, role) });
}

/**
 * Generic registration for volunteers or NGOs.
 * (Citizens submitting a help request never need an account - see
 * routes/requests.js - which keeps the emergency-request flow frictionless.)
 */
async function register(req, res, body) {
  const role = body.role;
  if (!['volunteer', 'ngo'].includes(role)) {
    return fail(res, 400, 'role must be "volunteer" or "ngo".');
  }

  const missing = requireFields(body, ['email', 'password']);
  if (missing.length) return fail(res, 400, `Missing fields: ${missing.join(', ')}`);

  if (findAccountByEmail(body.email)) {
    return fail(res, 409, 'An account with this email already exists.');
  }

  if (String(body.password).length < 6) {
    return fail(res, 400, 'Password must be at least 6 characters.');
  }

  if (role === 'volunteer') {
    const missingV = requireFields(body, ['name']);
    if (missingV.length) return fail(res, 400, `Missing fields: ${missingV.join(', ')}`);

    const volunteer = collection('volunteers').insert({
      id: generateId(),
      role: 'volunteer',
      name: sanitizeString(body.name, 150),
      email: String(body.email).toLowerCase(),
      passwordHash: hashPassword(body.password),
      phone: sanitizeString(body.phone, 40) || '',
      city: sanitizeString(body.city, 100) || '',
      skills: Array.isArray(body.skills) ? body.skills.slice(0, 20) : [],
      available: true,
      createdAt: nowIso(),
    });

    const token = sign({ id: volunteer.id, role: 'volunteer', email: volunteer.email });
    return ok(res, { token, user: publicAccount(volunteer, 'volunteer') }, 201);
  }

  // role === 'ngo'
  const missingN = requireFields(body, ['orgName']);
  if (missingN.length) return fail(res, 400, `Missing fields: ${missingN.join(', ')}`);

  const ngo = collection('ngos').insert({
    id: generateId(),
    role: 'ngo',
    orgName: sanitizeString(body.orgName, 150),
    email: String(body.email).toLowerCase(),
    passwordHash: hashPassword(body.password),
    phone: sanitizeString(body.phone, 40) || '',
    city: sanitizeString(body.city, 100) || '',
    services: Array.isArray(body.services) ? body.services.slice(0, 20) : [],
    status: 'pending', // NGOs start pending until an admin verifies them
    createdAt: nowIso(),
  });

  const token = sign({ id: ngo.id, role: 'ngo', email: ngo.email });
  ok(res, { token, user: publicAccount(ngo, 'ngo') }, 201);
}

async function me(req, res) {
  const found = req.user
    ? (req.user.role === 'admin'
        ? { account: (load().admins || []).find((a) => a.id === req.user.id), role: 'admin' }
        : req.user.role === 'ngo'
          ? { account: collection('ngos').findById(req.user.id), role: 'ngo' }
          : { account: collection('volunteers').findById(req.user.id), role: 'volunteer' })
    : null;

  if (!found || !found.account) return fail(res, 404, 'Account not found.');
  ok(res, publicAccount(found.account, found.role));
}

module.exports = { login, register, me, publicAccount };
