'use strict';

/**
 * ReliefConnect backend
 * ----------------------
 * Zero external runtime dependencies - only Node.js core modules.
 * Run with:  node server.js   (or  npm start)
 *
 * Serves:
 *   - The ReliefConnect frontend at            GET  /
 *   - The REST API at                          /api/*
 */

// Load .env manually (no "dotenv" package needed).
try {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  }
} catch (err) {
  // .env is optional - defaults in src/utils.js and here still apply.
}

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const Router = require('./src/router');
const { attachUser } = require('./src/middleware/auth');
const { ok, fail, readBody } = require('./src/utils');
const { seed } = require('./src/seed');

const authRoutes = require('./src/routes/auth');
const requestRoutes = require('./src/routes/requests');
const volunteerRoutes = require('./src/routes/volunteers');
const ngoRoutes = require('./src/routes/ngos');
const resourceRoutes = require('./src/routes/resources');
const statsRoutes = require('./src/routes/stats');

const PORT = Number(process.env.PORT) || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const FRONTEND_DIR = path.join(__dirname, 'frontend');

// Seed the datastore (admin account + light sample data) on boot.
seed();

/* ============================================================
   Routes
============================================================ */
const router = new Router();

router.get('/api/health', async (req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));

// Auth
router.post('/api/auth/register', async (req, res, params, body) => authRoutes.register(req, res, body));
router.post('/api/auth/login', async (req, res, params, body) => authRoutes.login(req, res, body));
router.get('/api/auth/me', async (req, res) => authRoutes.me(req, res));

// Help requests (citizen-facing)
router.post('/api/requests', async (req, res, params, body) => requestRoutes.create(req, res, body));
router.get('/api/requests', async (req, res, params, body, query) => requestRoutes.list(req, res, query));
router.get('/api/requests/:id', async (req, res, params) => requestRoutes.getOne(req, res, params));
router.patch('/api/requests/:id', async (req, res, params, body) => requestRoutes.update(req, res, params, body));
router.delete('/api/requests/:id', async (req, res, params) => requestRoutes.remove(req, res, params));

// Volunteers
router.post('/api/volunteers', async (req, res, params, body) => volunteerRoutes.create(req, res, body));
router.get('/api/volunteers', async (req, res, params, body, query) => volunteerRoutes.list(req, res, query));
router.get('/api/volunteers/:id', async (req, res, params) => volunteerRoutes.getOne(req, res, params));
router.patch('/api/volunteers/:id', async (req, res, params, body) => volunteerRoutes.update(req, res, params, body));
router.delete('/api/volunteers/:id', async (req, res, params) => volunteerRoutes.remove(req, res, params));

// NGOs
router.post('/api/ngos', async (req, res, params, body) => ngoRoutes.create(req, res, body));
router.get('/api/ngos', async (req, res, params, body, query) => ngoRoutes.list(req, res, query));
router.get('/api/ngos/:id', async (req, res, params) => ngoRoutes.getOne(req, res, params));
router.patch('/api/ngos/:id', async (req, res, params, body) => ngoRoutes.update(req, res, params, body));
router.patch('/api/ngos/:id/verify', async (req, res, params, body) => ngoRoutes.verify(req, res, params, body));
router.delete('/api/ngos/:id', async (req, res, params) => ngoRoutes.remove(req, res, params));

// Resources
router.post('/api/resources', async (req, res, params, body) => resourceRoutes.create(req, res, body));
router.get('/api/resources/summary', async (req, res) => resourceRoutes.summary(req, res));
router.get('/api/resources', async (req, res, params, body, query) => resourceRoutes.list(req, res, query));
router.get('/api/resources/:id', async (req, res, params) => resourceRoutes.getOne(req, res, params));
router.patch('/api/resources/:id', async (req, res, params, body) => resourceRoutes.update(req, res, params, body));
router.delete('/api/resources/:id', async (req, res, params) => resourceRoutes.remove(req, res, params));

// Stats
router.get('/api/stats/overview', async (req, res) => statsRoutes.overview(req, res));

/* ============================================================
   Static frontend file serving (does not touch the API)
============================================================ */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.normalize(path.join(FRONTEND_DIR, filePath));

  // Prevent path traversal outside the frontend directory.
  if (!resolved.startsWith(FRONTEND_DIR)) {
    fail(res, 400, 'Invalid path.');
    return true;
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    return false; // let caller decide (404)
  }

  const ext = path.extname(resolved);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(resolved).pipe(res);
  return true;
}

/* ============================================================
   HTTP server
============================================================ */
const server = http.createServer(async (req, res) => {
  // CORS - allow the frontend (served from anywhere) to call the API.
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (err) {
    return fail(res, 400, 'Invalid request URL.');
  }

  const pathname = decodeURIComponent(parsedUrl.pathname);
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  // Anything not under /api is treated as a static frontend asset request.
  if (!pathname.startsWith('/api/')) {
    const served = serveStatic(req, res, pathname);
    if (served) return;
    if (pathname !== '/favicon.ico') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    } else {
      res.writeHead(204);
      res.end();
    }
    return;
  }

  const match = router.match(req.method, pathname);
  if (!match) {
    return fail(res, 404, `No route for ${req.method} ${pathname}`);
  }

  attachUser(req);

  let body = {};
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    try {
      body = await readBody(req);
    } catch (err) {
      return fail(res, 400, err.message || 'Invalid request body.');
    }
  }

  try {
    await match.handler(req, res, match.params, body, query);
  } catch (err) {
    console.error('Unhandled route error:', err);
    if (!res.headersSent) {
      fail(res, 500, 'Internal server error.');
    }
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  🛟  ReliefConnect backend is running');
  console.log(`  ➜  Local:      http://localhost:${PORT}`);
  console.log(`  ➜  API base:   http://localhost:${PORT}/api`);
  console.log(`  ➜  Health:     http://localhost:${PORT}/api/health`);
  console.log('');
  console.log(`  Admin login -> ${process.env.ADMIN_EMAIL || 'admin@reliefconnect.org'} / ${process.env.ADMIN_PASSWORD || 'Admin@123'}`);
  console.log('');
});

module.exports = server;
