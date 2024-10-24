import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Resolve paths in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const diffPath = join(__dirname, '../output/diff.json');

// Read diff.json and extract the version
const diff = JSON.parse(await readFile(diffPath, 'utf8'));

const pathsAddedItems = diff["xPathAddedRule"].items;
const pathsRemovedItems = diff["xPathRemovedRule"].items;

console.log("Paths ADDED");
for (const item of pathsAddedItems) {
  console.log(`  ${item.diff.path[1]}`);
}

console.log("Paths REMOVED");
for (const item of pathsRemovedItems) {
  console.log(`  ${item.diff.path[1]}`);
}