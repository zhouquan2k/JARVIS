import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const desktopRoot = resolve(__dirname, '..');
const repoRoot = resolve(desktopRoot, '../..');
const sourceIconPath = join(repoRoot, 'assets/jarvis.png');
const publicDir = join(desktopRoot, 'public');
const pngIconPath = join(publicDir, 'jarvis.png');
const icnsIconPath = join(publicDir, 'jarvis.icns');
const iconsetDir = join(desktopRoot, '.tmp/jarvis.iconset');
const sipsPath = '/usr/bin/sips';
const iconutilPath = '/usr/bin/iconutil';

function ensureSourceIcon() {
    if (!existsSync(sourceIconPath)) {
        throw new Error(`Missing source icon: ${sourceIconPath}`);
    }
}

function ensureMacTools() {
    if (!existsSync(sipsPath) || !existsSync(iconutilPath)) {
        throw new Error('macOS icon generation requires the built-in `sips` and `iconutil` tools.');
    }
}

function generatePng() {
    mkdirSync(publicDir, { recursive: true });
    execFileSync(sipsPath, ['-s', 'format', 'png', sourceIconPath, '--out', pngIconPath], {
        stdio: 'inherit'
    });
}

function buildIcns() {
    const iconVariants = [
        { width: 16, height: 16, filename: 'icon_16x16.png' },
        { width: 32, height: 32, filename: 'icon_16x16@2x.png' },
        { width: 32, height: 32, filename: 'icon_32x32.png' },
        { width: 64, height: 64, filename: 'icon_32x32@2x.png' },
        { width: 128, height: 128, filename: 'icon_128x128.png' },
        { width: 256, height: 256, filename: 'icon_128x128@2x.png' },
        { width: 256, height: 256, filename: 'icon_256x256.png' },
        { width: 512, height: 512, filename: 'icon_256x256@2x.png' },
        { width: 512, height: 512, filename: 'icon_512x512.png' },
        { width: 1024, height: 1024, filename: 'icon_512x512@2x.png' }
    ];

    try {
        rmSync(iconsetDir, { recursive: true, force: true });
        mkdirSync(iconsetDir, { recursive: true });

        for (const variant of iconVariants) {
            execFileSync(sipsPath, ['-z', String(variant.height), String(variant.width), pngIconPath, '--out', join(iconsetDir, variant.filename)], {
                stdio: 'inherit'
            });
        }

        iconutil(['-c', 'icns', iconsetDir, '-o', icnsIconPath]);
    } catch (error) {
        console.warn('Skipping `.icns` generation. The current source image is likely too small for a valid macOS app icon.', {
            sourceIconPath,
            icnsIconPath
        });
        rmSync(icnsIconPath, { force: true });
    } finally {
        rmSync(iconsetDir, { recursive: true, force: true });
    }
}

function iconutil(args) {
    execFileSync(iconutilPath, args, { stdio: 'inherit' });
}

function main() {
    ensureSourceIcon();
    ensureMacTools();
    generatePng();
    buildIcns();
    console.log(`Prepared desktop icons:\n- ${pngIconPath}${existsSync(icnsIconPath) ? `\n- ${icnsIconPath}` : ''}`);
}

main();
