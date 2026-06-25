import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pngPath = path.join(rootDir, 'electron', 'assets', 'app-icon.png');
const icoPath = path.join(rootDir, 'electron', 'assets', 'app-icon.ico');

const buffer = await pngToIco(pngPath);
fs.writeFileSync(icoPath, buffer);
console.log(`Generated ${icoPath} (${buffer.length} bytes)`);
