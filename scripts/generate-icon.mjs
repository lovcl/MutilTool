import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pngPath = path.join(root, 'electron/assets/app-icon.png');
const icoPath = path.join(root, 'electron/assets/app-icon.ico');

if (!fs.existsSync(pngPath)) {
  console.error(`Missing icon source: ${pngPath}`);
  process.exit(1);
}

const buf = await pngToIco(pngPath);
fs.writeFileSync(icoPath, buf);
console.log(`Generated ${icoPath} (${buf.length} bytes)`);
