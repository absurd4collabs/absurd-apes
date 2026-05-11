/**
 * Bundle real `buffer` + `bn.js` for the browser (IIFE). Load output BEFORE @solana/web3.js.
 * Uses npx esbuild so Vercel/local need no preinstalled esbuild.
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'js', 'solana-tx-deps-entry.js');
const outfile = path.join(root, 'js', 'solana-tx-deps.iife.js');

if (!fs.existsSync(entry)) {
  console.error('[build-solana-browser-deps] missing entry:', entry);
  process.exit(1);
}

const cmd =
  'npx --yes esbuild ' +
  JSON.stringify(entry) +
  ' --bundle --platform=browser --format=iife --outfile=' +
  JSON.stringify(outfile);

execSync(cmd, { stdio: 'inherit', cwd: root, env: process.env });
console.log('[build-solana-browser-deps] wrote', outfile);
