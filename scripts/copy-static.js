const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
// Vercel expects output in "public"; copy static site here so build succeeds and static files are served
const dest = path.join(root, 'public');

function copyDir(src, d) {
  fs.mkdirSync(d, { recursive: true });
  fs.readdirSync(src).forEach((name) => {
    const s = path.join(src, name);
    const t = path.join(d, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, t);
    else fs.copyFileSync(s, t);
  });
}

fs.mkdirSync(dest, { recursive: true });
['index.html', 'pairs.html', 'css', 'js', 'assets'].forEach((name) => {
  const src = path.join(root, name);
  if (!fs.existsSync(src)) return;
  const d = path.join(dest, name);
  if (fs.statSync(src).isDirectory()) copyDir(src, d);
  else fs.copyFileSync(src, d);
});
console.log('Static files copied to public');
