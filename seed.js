'use strict';

const { collection, load, persist } = require('./store');
const { generateId, nowIso, hashPassword, calculatePriority } = require('./utils');

function seed() {
  const db = load();
  const ngos = collection('ngos');
  const volunteers = collection('volunteers');
  const requests = collection('requests');
  const resources = collection('resources');

  // ---- Admin account -------------------------------------------------
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@reliefconnect.org').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';

  if (!db.admins) db.admins = [];
  if (!db.admins.find((a) => a.email === adminEmail)) {
    db.admins.push({
      id: generateId(),
      role: 'admin',
      name: 'Platform Admin',
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      createdAt: nowIso(),
    });
    persist();
  }

  if (db.meta && db.meta.seededAt) {
    return; // sample data already seeded once - don't keep re-adding it
  }

  // ---- Sample NGO (verified) ------------------------------------------
  if (ngos.all().length === 0) {
    const sampleNgo = ngos.insert({
      id: generateId(),
      role: 'ngo',
      orgName: 'Coastal Relief Foundation',
      email: 'contact@coastalrelief.org',
      passwordHash: hashPassword('Ngo@12345'),
      phone: '+10000000000',
      city: 'Sample City',
      services: ['Medical Aid', 'Food', 'Water'],
      status: 'verified',
      createdAt: nowIso(),
    });

    ngos.insert({
      id: generateId(),
      role: 'ngo',
      orgName: 'Community Aid Network',
      email: 'hello@communityaid.org',
      passwordHash: hashPassword('Ngo@12345'),
      phone: '+10000000001',
      city: 'Sample City',
      services: ['Shelter', 'Logistics'],
      status: 'pending',
      createdAt: nowIso(),
    });

    resources.insert({
      id: generateId(),
      ngoId: sampleNgo.id,
      type: 'water',
      quantity: 500,
      unit: 'liters',
      location: 'Central Warehouse',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    resources.insert({
      id: generateId(),
      ngoId: sampleNgo.id,
      type: 'medical',
      quantity: 80,
      unit: 'kits',
      location: 'Central Warehouse',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  // ---- Sample volunteers ------------------------------------------------
  if (volunteers.all().length === 0) {
    volunteers.insert({
      id: generateId(),
      role: 'volunteer',
      name: 'Alex Rivera',
      email: 'alex.volunteer@example.com',
      passwordHash: hashPassword('Volunteer@123'),
      phone: '+10000000010',
      city: 'Sample City',
      skills: ['First Aid', 'Medical Assistance'],
      available: true,
      createdAt: nowIso(),
    });
    volunteers.insert({
      id: generateId(),
      role: 'volunteer',
      name: 'Priya Nair',
      email: 'priya.volunteer@example.com',
      passwordHash: hashPassword('Volunteer@123'),
      phone: '+10000000011',
      city: 'Sample City',
      skills: ['Logistics', 'Driving'],
      available: true,
      createdAt: nowIso(),
    });
  }

  // ---- Sample requests ---------------------------------------------------
  if (requests.all().length === 0) {
    const samples = [
      {
        fullName: 'Demo Citizen A',
        phone: '+10000000020',
        helpType: 'rescue',
        urgency: 'emergency',
        city: 'Sample City',
        area: 'Area A',
        address: 'Near the old bridge, Area A',
        peopleAffected: 4,
        description: '4 people require immediate rescue assistance.',
        notes: '',
      },
      {
        fullName: 'Demo Citizen B',
        phone: '+10000000021',
        helpType: 'water',
        urgency: 'high',
        city: 'Sample City',
        area: 'Area B',
        address: 'Community hall, Area B',
        peopleAffected: 20,
        description: 'Drinking water is required for affected families.',
        notes: '',
      },
      {
        fullName: 'Demo Citizen C',
        phone: '+10000000022',
        helpType: 'food',
        urgency: 'normal',
        city: 'Sample City',
        area: 'Area C',
        address: 'Relief camp, Area C',
        peopleAffected: 10,
        description: 'Food packets are required for affected residents.',
        notes: '',
      },
    ];

    for (const s of samples) {
      requests.insert({
        id: generateId(),
        ...s,
        latitude: null,
        longitude: null,
        priorityScore: calculatePriority(s.helpType, s.peopleAffected, s.urgency),
        status: 'reported',
        assignedVolunteerId: null,
        assignedNgoId: null,
        statusHistory: [{ status: 'reported', at: nowIso() }],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
  }

  db.meta = db.meta || {};
  db.meta.seededAt = nowIso();
  persist();
}

module.exports = { seed };
