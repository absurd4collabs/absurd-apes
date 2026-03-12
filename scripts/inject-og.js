/**
 * Replace {{SITE_URL}} in index.html with actual deployment URL for Open Graph meta tags.
 * Vercel sets VERCEL_URL (e.g. absurd-apes-xxx.vercel.app); fallback to BASE_URL or default.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
// Prefer explicit SITE_URL (set in Vercel env) so embed image URL is always the production domain
const siteUrl = (process.env.SITE_URL || process.env.BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) || 'https://absurd-apes.vercel.app').replace(/\/$/, '');

['index.html'].forEach((file) => {
  const filePath = path.join(root, file);
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replace(/\{\{SITE_URL\}\}/g, siteUrl);
  fs.writeFileSync(filePath, html, 'utf8');
});

console.log('OG meta: SITE_URL =', siteUrl);
