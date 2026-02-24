/**
 * Fetches collection images and saves them locally for instant load on cards and prizes popup.
 *
 * Usage:
 *   1. Start the server: npm start
 *   2. Run: npm run cache-collections
 *
 * Or with API_BASE: API_BASE=http://localhost:8080 npm run cache-collections
 *
 * Saves to assets/collections/ and writes manifest.json. Commit these for fast loading.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:8080';
const ME_BASE = 'https://api-mainnet.magiceden.dev/v2';
const SLUGS = ['absurd-apes', 'col2'];
const OUT_DIR = path.join(__dirname, '..', 'assets', 'collections');

function getExtFromUrl(url) {
  if (!url || typeof url !== 'string') return 'png';
  try {
    const p = new URL(url).pathname.toLowerCase();
    if (p.endsWith('.gif')) return 'gif';
    if (p.endsWith('.webp')) return 'webp';
    if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'jpg';
    if (p.endsWith('.png')) return 'png';
  } catch (_) {}
  return 'png';
}

function getExtFromContentType(ct) {
  if (!ct || typeof ct !== 'string') return 'png';
  const m = ct.split(';')[0].trim().toLowerCase();
  if (m === 'image/gif') return 'gif';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  return 'png';
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    console.log('Created', OUT_DIR);
  }

  const manifest = {};
  let collections = [];

  try {
    const apiRes = await axios.get(`${API_BASE}/api/collections`, {
      timeout: 10000,
      validateStatus: () => true,
    });
    if (apiRes.status === 200 && apiRes.data && Array.isArray(apiRes.data.collections)) {
      collections = apiRes.data.collections;
      console.log('Got', collections.length, 'collections from', API_BASE);
    }
  } catch (e) {
    console.warn('Local API failed:', e.message, '- ensure server is running (npm start)');
  }

  for (const slug of SLUGS) {
    try {
      let imgUrl = null;
      const fromApi = collections.find((c) => c.symbol === slug);
      if (fromApi) {
        imgUrl = fromApi.animationUrl || fromApi.image;
      }
      if (!imgUrl) {
        const metaRes = await axios.get(`${ME_BASE}/collections/${slug}`, {
          timeout: 10000,
          validateStatus: () => true,
        });
        if (metaRes.status !== 200 || !metaRes.data) {
          console.warn(`${slug}: no image (API ${metaRes.status})`);
          continue;
        }
        const m = metaRes.data;
        imgUrl = m.animation_url || m.animationUrl || m.image || m.imageURI;
      }
      if (!imgUrl) {
        console.warn(`${slug}: no image URL`);
        continue;
      }

      const imgRes = await axios.get(imgUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        validateStatus: () => true,
      });
      if (imgRes.status !== 200 || !imgRes.data) {
        console.warn(`${slug}: image download failed (${imgRes.status})`);
        continue;
      }

      const ext =
        getExtFromContentType(imgRes.headers['content-type']) || getExtFromUrl(imgUrl);
      const filename = `${slug}.${ext}`;
      const outPath = path.join(OUT_DIR, filename);
      fs.writeFileSync(outPath, Buffer.from(imgRes.data));
      manifest[slug] = filename;
      console.log(`${slug}: saved ${imgUrl} -> ${path.relative(process.cwd(), outPath)}`);
    } catch (e) {
      console.warn(`${slug}: ${e.message}`);
    }
  }

  if (Object.keys(manifest).length > 0) {
    const manifestPath = path.join(OUT_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('Wrote', path.relative(process.cwd(), manifestPath));
  }
}

main();
