import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('desktop renderer html', () => {
    it('allows blob iframe previews for document viewers', async () => {
        const htmlPath = path.resolve(import.meta.dirname, '../index.html');
        const html = await readFile(htmlPath, 'utf8');

        expect(html).toContain("http-equiv=\"Content-Security-Policy\"");
        expect(html).toContain("frame-src 'self' blob:");
    });
});
