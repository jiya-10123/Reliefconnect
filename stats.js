'use strict';

const { collection } = require('../store');
const { ok } = require('../utils');

/**
 * GET /api/stats/overview
 * Powers the 5 "Live Overview" cards on the homepage:
 * Active Requests, Urgent Requests, Active Volunteers, Verified NGOs,
 * Available Resources.
 */
async function overview(req, res) {
  const requests = collection('requests').all();
  const volunteers = collection('volunteers').all();
  const ngos = collection('ngos').all();
  const resources = collection('resources').all();

  const activeRequests = requests.filter((r) => r.status !== 'resolved').length;
  const urgentRequests = requests.filter(
    (r) => r.status !== 'resolved' && (r.urgency === 'emergency' || r.urgency === 'high')
  ).length;
  const activeVolunteers = volunteers.filter((v) => v.available).length;
  const verifiedNgos = ngos.filter((n) => n.status === 'verified').length;
  const availableResources = resources.reduce((sum, r) => sum + (r.quantity || 0), 0);

  ok(res, {
    activeRequests,
    urgentRequests,
    activeVolunteers,
    verifiedNgos,
    availableResources,
    totals: {
      requests: requests.length,
      volunteers: volunteers.length,
      ngos: ngos.length,
      resources: resources.length,
    },
  });
}

module.exports = { overview };
