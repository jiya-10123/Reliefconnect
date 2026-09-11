# ReliefConnect Backend

A complete backend for the **ReliefConnect** disaster relief coordination
platform — built with **zero external runtime dependencies** (only Node.js
core modules: `http`, `fs`, `crypto`, `path`, `url`). That means:

- No `npm install` required to run it.
- No native modules, no version conflicts, no install failures.
- Works on any machine with Node.js 16+.

It also serves your existing frontend, so the whole app runs from a single
command.

---

## 1. Run it

```bash
cd reliefconnect-backend
node server.js
```

You should see:

```
🛟  ReliefConnect backend is running
➜  Local:      http://localhost:5000
➜  API base:   http://localhost:5000/api
➜  Health:     http://localhost:5000/api/health

Admin login -> admin@reliefconnect.org / Admin@123
```

Open **http://localhost:5000** in your browser — that's the ReliefConnect
frontend (unchanged design/layout), now wired to the live backend:

- The "Request Emergency Help" form really submits and gets a real priority
  score back.
- The "Become a Volunteer" modal really registers a volunteer.
- The "Live Overview" numbers, "Priority Requests" cards, and "Available
  Resources" cards load real data from the API on page load.

Optional: copy `.env.example` to `.env` to customize the port, admin
credentials, or CORS origin. Sensible defaults are built in either way.

To wipe all data and reseed fresh sample data:

```bash
npm run seed:reset
```

(All data lives in `data/db.json` — delete that file directly to reset.)

---

## 2. What's inside

```
reliefconnect-backend/
├── server.js              # Entry point: HTTP server, routing, static file serving
├── package.json
├── .env.example
├── data/
│   └── db.json             # Auto-created JSON datastore (git-ignored)
├── frontend/
│   └── index.html          # Your original frontend, with API calls wired in
├── scripts/
│   └── reset-data.js
└── src/
    ├── store.js            # Tiny JSON-file datastore (collection helpers)
    ├── router.js           # Minimal path-matching router (supports :params)
    ├── utils.js             # Password hashing, JWT-style tokens, priority scoring
    ├── seed.js              # Seeds an admin account + sample data on first run
    ├── middleware/
    │   └── auth.js          # Bearer-token auth + role checks
    └── routes/
        ├── auth.js
        ├── requests.js
        ├── volunteers.js
        ├── ngos.js
        ├── resources.js
        └── stats.js
```

### Why no database server / no npm packages?

For a hackathon, the #1 cause of "it doesn't run on the judge's laptop" is a
broken `npm install` or a missing database. This backend sidesteps both:
data is stored in a plain JSON file (`data/db.json`), and everything else
uses Node's built-in modules. It's easy to swap in Postgres/Mongo/Supabase
later — every route only ever talks to `src/store.js`, so that's the one
file you'd change.

---

## 3. Frontend changes

Your HTML/CSS design was **not changed** in any visual way. The only edits:

1. The `<script>` block at the bottom of the page was replaced so the forms
   call the real API instead of just showing a demo toast, and so the
   overview stats / priority requests / resource cards load live data.
2. A few `id` attributes were added to elements that had none, purely so
   JavaScript can read their values (the volunteer modal's Name/Email/City/
   Skill fields, and a wrapper `id="requestsGrid"` on the priority-requests
   row). No classes, styles, or layout were touched.

---

## 4. API reference

Base URL: `http://localhost:5000/api`

All responses are JSON in the shape `{ "success": true, "data": ... }` or
`{ "success": false, "error": "..." }`.

Protected routes require a header: `Authorization: Bearer <token>`.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | – | Register a volunteer or NGO. Body: `{ role: "volunteer"|"ngo", email, password, name/orgName, ... }` |
| POST | `/auth/login` | – | `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | any | Returns the logged-in account's profile |

### Help Requests (citizen-facing, no login needed to submit)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/requests` | – | Submit a help request. Priority score computed server-side. |
| GET | `/requests` | – | List requests. Query: `status`, `urgency`, `helpType`, `city`, `sort=priority|recent`, `limit` |
| GET | `/requests/:id` | – | Get one request |
| PATCH | `/requests/:id` | volunteer/ngo/admin | Update `status`, `assignedVolunteerId`, `assignedNgoId` |
| DELETE | `/requests/:id` | admin | Delete a request |

Valid `helpType`: `rescue, medical, food, water, shelter, clothing, other`
Valid `urgency`: `emergency, high, normal`
Valid `status`: `reported, assigned, in_progress, resolved`

**Priority formula** (identical to what the frontend already simulated):
`typeScore + peopleAffected*5 + urgencyScore`, where
`typeScore = {rescue:100, medical:90, shelter:70, water:60, food:50, clothing:40, other:30}`
and `urgencyScore = {emergency:50, high:25, normal:0}`.

### Volunteers

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/volunteers` | – | Register (matches the "Become a Volunteer" modal) |
| GET | `/volunteers` | – | List. Query: `available=true`, `skill`, `city` |
| GET | `/volunteers/:id` | – | Get one |
| PATCH | `/volunteers/:id` | self/admin | Update availability/skills/city/phone |
| DELETE | `/volunteers/:id` | admin | Remove |

### NGOs

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/ngos` | – | Register (starts `status: "pending"`) |
| GET | `/ngos` | – | List. Query: `status`, `city`, `service` |
| GET | `/ngos/:id` | – | Get one |
| PATCH | `/ngos/:id` | self/admin | Update profile |
| PATCH | `/ngos/:id/verify` | admin | `{ status: "verified"|"suspended"|"pending" }` |
| DELETE | `/ngos/:id` | admin | Remove |

### Resources

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/resources` | ngo/admin | Add inventory. `{ type, quantity, unit, location }` |
| GET | `/resources` | – | List. Query: `type`, `ngoId` |
| GET | `/resources/summary` | – | Totals per type (powers the homepage resource cards) |
| GET | `/resources/:id` | – | Get one |
| PATCH | `/resources/:id` | owner ngo/admin | Update |
| DELETE | `/resources/:id` | owner ngo/admin | Remove |

Valid `type`: `water, food, medical, shelter, clothing, transport, other`

### Stats

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/stats/overview` | – | Live overview numbers for the homepage |

### Health

| Method | Path |
|---|---|
| GET | `/health` |

---

## 5. Try it with curl

```bash
# Submit a help request
curl -X POST http://localhost:5000/api/requests \
  -H "Content-Type: application/json" \
  -d '{
    "fullName":"Jane Doe","phone":"5551234567","helpType":"medical",
    "urgency":"emergency","city":"Springfield","area":"Downtown",
    "address":"123 Main St","peopleAffected":2,
    "description":"Need urgent medical supplies"
  }'

# Log in as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@reliefconnect.org","password":"Admin@123"}'

# Verify a pending NGO (use the token from login above)
curl -X PATCH http://localhost:5000/api/ngos/<ngo-id>/verify \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"verified"}'
```

---

## 6. Default accounts (seeded automatically)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@reliefconnect.org` | `Admin@123` |
| Sample NGO (verified) | `contact@coastalrelief.org` | `Ngo@12345` |
| Sample NGO (pending) | `hello@communityaid.org` | `Ngo@12345` |
| Sample Volunteer | `alex.volunteer@example.com` | `Volunteer@123` |

Change the admin credentials via `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`)
before your first run if you don't want the defaults.

---

## 7. Notes / next steps

- **Storage**: `data/db.json` is a flat file — fine for a hackathon demo,
  not for concurrent production traffic. Swapping in a real database only
  requires rewriting `src/store.js`.
- **Auth**: tokens are a minimal HMAC-signed JWT-style token implemented
  with Node's `crypto` module (7-day expiry) — no external JWT library
  needed.
- **Safety**: the "Contact Local Emergency Services" button intentionally
  does not hardcode any emergency number, matching the original frontend's
  safety notice.
