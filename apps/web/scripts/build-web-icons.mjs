import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webRoot = resolve(__dirname, '..');
const repoRoot = resolve(webRoot, '../..');
const publicDir = join(webRoot, 'public');
const sourceIconPath = join(repoRoot, 'assets/jarvis.png');
const sipsPath = '/usr/bin/sips';

function ensureSourceIcon() {
    if (!existsSync(sourceIconPath)) {
        throw new Error(`Missing source icon: ${sourceIconPath}`);
    }
}

function buildIcon(filename, size) {
    execFileSync(sipsPath, ['-z', String(size), String(size), '-s', 'format', 'png', sourceIconPath, '--out', join(publicDir, filename)], {
        stdio: 'inherit'
    });
}

function main() {
    ensureSourceIcon();
    mkdirSync(publicDir, { recursive: true });
    buildIcon('jarvis-192.png', 192);
    buildIcon('jarvis-512.png', 512);
    buildIcon('apple-touch-icon.png', 180);
    console.log('Prepared web icons.');
}

main();
