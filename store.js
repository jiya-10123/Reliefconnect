'use strict';

/**
 * A tiny, dependency-free JSON-file datastore.
 *
 * Good enough for a hackathon-scale deployment: everything lives in
 * memory and is flushed to data/db.json on every write. Swap this
 * module out for a real database later without touching the routes,
 * since routes only ever call the collection helpers below.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DATA = {
  users: [],       // citizens/admins are not stored as users by default; volunteers & ngos & admin are
  requests: [],     // disaster relief help requests
  volunteers: [],   // volunteer profiles
  ngos: [],         // NGO / relief organization profiles
  resources: [],    // relief resource inventory, owned by an NGO
  meta: {
    seededAt: null,
  },
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
  }
}

ensureDataFile();

let cache = null;

function load() {
  if (cache) return cache;
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  try {
    cache = JSON.parse(raw);
  } catch (err) {
    // Corrupt file - fall back to defaults rather than crashing the server.
    cache = JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
  // Backfill any collections added in newer versions of this file.
  for (const key of Object.keys(DEFAULT_DATA)) {
    if (!(key in cache)) cache[key] = DEFAULT_DATA[key];
  }
  return cache;
}

let saveQueued = false;
function persist() {
  // Debounce disk writes slightly so a burst of requests doesn't
  // hammer the filesystem, while still writing durably.
  if (saveQueued) return;
  saveQueued = true;
  setImmediate(() => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2), 'utf8');
    } finally {
      saveQueued = false;
    }
  });
}

function collection(name) {
  const db = load();
  if (!db[name]) db[name] = [];

  return {
    all() {
      return db[name].slice();
    },
    find(predicate) {
      return db[name].find(predicate);
    },
    filter(predicate) {
      return db[name].filter(predicate);
    },
    findById(id) {
      return db[name].find((item) => item.id === id);
    },
    insert(item) {
      db[name].push(item);
      persist();
      return item;
    },
    updateById(id, patch) {
      const idx = db[name].findIndex((item) => item.id === id);
      if (idx === -1) return null;
      db[name][idx] = { ...db[name][idx], ...patch };
      persist();
      return db[name][idx];
    },
    deleteById(id) {
      const idx = db[name].findIndex((item) => item.id === id);
      if (idx === -1) return false;
      db[name].splice(idx, 1);
      persist();
      return true;
    },
    count(predicate) {
      return predicate ? db[name].filter(predicate).length : db[name].length;
    },
  };
}

module.exports = { collection, load, persist };
