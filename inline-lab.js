import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, 'lab/index.html');
const bundlePath = path.join(__dirname, 'lab/lgr-bundle.js');

const bundle = fs.readFileSync(bundlePath, 'utf8');
const lines = fs.readFileSync(indexPath, 'utf8').split(/\r?\n/);

const scriptIdx = lines.findIndex(l => l.includes('<script type="module">'));
if (scriptIdx === -1) {
  console.error('Could not find script tag');
  process.exit(1);
}

// remove line with <script type="module"> and the 5 import lines
const before = lines.slice(0, scriptIdx);
const after = lines.slice(scriptIdx + 6); // skip <script type="module"> and 5 imports

const newHtml = before.join('\n') + '\n  <script>\n' + bundle + '\n' + after.join('\n');
fs.writeFileSync(indexPath, newHtml, 'utf8');
console.log('Successfully updated lab/index.html with self-contained bundle!');
