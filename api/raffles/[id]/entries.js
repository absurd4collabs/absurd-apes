const app = require('../../../server');

module.exports = (req, res) => {
  const pathname = (req.url || req.path || '').split('?')[0];
  const segments = pathname.replace(/^\/api\/raffles\/?/, '').split('/').filter(Boolean);
  const id = req.query.id || segments[0] || '';
  const q = (req.url || '').includes('?') ? '?' + (req.url || '').split('?').slice(1).join('?') : '';
  req.url = '/api/raffles/' + id + '/entries' + q;
  return app(req, res);
};
