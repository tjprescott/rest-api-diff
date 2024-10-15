import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Resolve paths in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkgPath = join(__dirname, '../package.json');
const versionFilePath = join(__dirname, '../src/version.ts');

// Read package.json and extract the version
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
const versionContent = `export const VERSION = "${pkg.version}";\n`;

// Write the version to a version.js file
await writeFile(versionFilePath, versionContent);

console.log('Version file generated');
