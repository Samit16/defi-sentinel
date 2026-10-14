// deploy script for Next.js static export
import { execSync } from 'child_process';
import { rmSync, copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const root = process.cwd();
console.log('Building Next.js static export...');
execSync('npm run build', { stdio: 'inherit' });

const outDir = join(root, 'out');
const target = resolve(root, '..', 'dashboard', 'static', 'app');
// clean previous export
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

function copyRecursive(src, dest) {
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(outDir, target);
console.log('Deploy finished.');
