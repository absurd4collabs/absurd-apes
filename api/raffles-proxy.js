/**
 * Vercel: single handler for all /api/raffles/* (admin-check, :id/entries, :id/buy, etc.)
 * Invoked via rewrites; path segment is in req.query.path.
 */
const app = require('../server');

module.exports = (req, res) => {
  const path = (req.query && req.query.path) ? '/' + req.query.path : '';
  const q = (req.url || '').includes('?') ? '?' + (req.url || '').split('?').slice(1).join('?') : '';
  req.url = '/api/raffles' + path + q;
  return app(req, res);
};
