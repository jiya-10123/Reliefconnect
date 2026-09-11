'use strict';

/**
 * Wipes data/db.json so the next server start reseeds fresh sample data.
 * Usage: npm run seed:reset
 */
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

if (fs.existsSync(DB_FILE)) {
  fs.unlinkSync(DB_FILE);
  console.log('Removed data/db.json - it will be recreated with fresh seed data on next start.');
} else {
  console.log('No data/db.json found - nothing to reset.');
}
