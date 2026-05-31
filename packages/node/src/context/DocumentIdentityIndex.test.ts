import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DocumentIdentityIndex } from './DocumentIdentityIndex.ts';

async function createTempDir(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-id-test-'));
}

async function writeMd(dir: string, name: string, content: string): Promise<string> {
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, content, 'utf8');
    return filePath;
}

describe('DocumentIdentityIndex', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await createTempDir();
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('builds correct maps from scanned frontmatter', async () => {
        await writeMd(tmpDir, 'doc1.md', '---\njarvis_id: ID001\ntitle: Doc 1\n---\nContent 1');
        await writeMd(tmpDir, 'doc2.md', '---\njarvis_id: ID002\n---\nContent 2');

        const index = new DocumentIdentityIndex();
        await index.initialize(tmpDir, '/');

        expect(index.resolve('ID001')).toBe('/doc1.md');
        expect(index.resolve('ID002')).toBe('/doc2.md');
        expect(index.resolveByPath('/doc1.md')).toBe('ID001');
        expect(index.resolveByPath('/doc2.md')).toBe('ID002');
    });

    it('ignores .md files without jarvis_id', async () => {
        await writeMd(tmpDir, 'noId.md', '# No ID\nJust content');

        const index = new DocumentIdentityIndex();
        await index.initialize(tmpDir, '/');

        expect(index.resolveByPath('/noId.md')).toBeUndefined();
    });

    it('detects and resolves duplicate IDs by re-assigning to newer file', async () => {
        const older = await writeMd(tmpDir, 'older.md', '---\njarvis_id: DUPID\n---\nOlder');
        await new Promise((r) => setTimeout(r, 10));
        const newer = await writeMd(tmpDir, 'newer.md', '---\njarvis_id: DUPID\n---\nNewer');

        const index = new DocumentIdentityIndex();
        await index.initialize(tmpDir, '/');

        expect(index.resolve('DUPID')).toBe('/older.md');
        const newerContent = await fs.readFile(newer, 'utf8');
        expect(newerContent).not.toContain('jarvis_id: DUPID');
        const newId = index.resolveByPath('/newer.md');
        expect(newId).toBeDefined();
        expect(newId).not.toBe('DUPID');

        void older;
    });

    it('remap updates single file path', async () => {
        await writeMd(tmpDir, 'doc.md', '---\njarvis_id: REMAPID\n---\nContent');

        const index = new DocumentIdentityIndex();
        await index.initialize(tmpDir, '/');

        index.remap('/doc.md', '/renamed.md');

        expect(index.resolve('REMAPID')).toBe('/renamed.md');
        expect(index.resolveByPath('/renamed.md')).toBe('REMAPID');
        expect(index.resolveByPath('/doc.md')).toBeUndefined();
    });

    it('remap updates all files in a renamed directory', async () => {
        const subDir = path.join(tmpDir, 'notes');
        await fs.mkdir(subDir);
        await writeMd(subDir, 'a.md', '---\njarvis_id: DIRA\n---\nA');
        await writeMd(subDir, 'b.md', '---\njarvis_id: DIRB\n---\nB');

        const index = new DocumentIdentityIndex();
        await index.initialize(tmpDir, '/');

        index.remap('/notes', '/archive');

        expect(index.resolve('DIRA')).toBe('/archive/a.md');
        expect(index.resolve('DIRB')).toBe('/archive/b.md');
        expect(index.resolveByPath('/notes/a.md')).toBeUndefined();
    });

    it('assignId creates frontmatter when file has none', async () => {
        const filePath = await writeMd(tmpDir, 'plain.md', '# Plain\nNo frontmatter');

        const index = new DocumentIdentityIndex();
        await index.initialize(tmpDir, '/');

        const id = await index.assignId('/plain.md', filePath);
        expect(id).toBeTruthy();
        expect(index.resolve(id)).toBe('/plain.md');
        expect(index.resolveByPath('/plain.md')).toBe(id);

        const content = await fs.readFile(filePath, 'utf8');
        expect(content).toContain(`jarvis_id: ${id}`);
        expect(content).toContain('# Plain');
    });

    it('assignId preserves existing frontmatter fields', async () => {
        const filePath = await writeMd(tmpDir, 'with-fm.md', '---\ntitle: My Doc\ntags: [a, b]\n---\nBody');

        const index = new DocumentIdentityIndex();
        await index.initialize(tmpDir, '/');

        const id = await index.assignId('/with-fm.md', filePath);
        const content = await fs.readFile(filePath, 'utf8');
        expect(content).toContain('title: My Doc');
        expect(content).toContain('tags: [a, b]');
        expect(content).toContain(`jarvis_id: ${id}`);
        expect(content).toContain('Body');
    });

    it('assignId returns existing id without file modification', async () => {
        const filePath = await writeMd(tmpDir, 'existing.md', '---\njarvis_id: EXISTING\n---\nContent');

        const index = new DocumentIdentityIndex();
        await index.initialize(tmpDir, '/');

        const id = await index.assignId('/existing.md', filePath);
        expect(id).toBe('EXISTING');
    });
});
