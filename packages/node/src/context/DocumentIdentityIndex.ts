import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IDocumentIdentityIndex } from '../../../core/src/interfaces/IDocumentIdentity.ts';

function generateUlid(): string {
    const timestamp = Date.now();
    const timestampBase32 = timestamp.toString(32).toUpperCase().padStart(10, '0');
    const randomBytes = new Uint8Array(10);
    crypto.getRandomValues(randomBytes);
    const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let randomPart = '';
    for (const byte of randomBytes) {
        randomPart += chars[byte % 32];
    }
    return `${timestampBase32}${randomPart}`;
}

function parseFrontmatterJarvisId(content: string): string | undefined {
    if (!content.startsWith('---')) {
        return undefined;
    }
    const end = content.indexOf('\n---', 3);
    if (end < 0) {
        return undefined;
    }
    const frontmatter = content.slice(3, end);
    const match = frontmatter.match(/^jarvis_id:\s*(.+)$/m);
    if (!match) {
        return undefined;
    }
    const id = match[1].trim().replace(/^['"]|['"]$/g, '');
    return id || undefined;
}

function insertJarvisId(content: string, id: string): string {
    if (content.startsWith('---')) {
        const end = content.indexOf('\n---', 3);
        if (end >= 0) {
            const frontmatter = content.slice(0, end);
            const rest = content.slice(end);
            return `${frontmatter}\njarvis_id: ${id}${rest}`;
        }
    }
    return `---\njarvis_id: ${id}\n---\n${content}`;
}

function replaceJarvisId(content: string, newId: string): string {
    if (!content.startsWith('---')) {
        return `---\njarvis_id: ${newId}\n---\n${content}`;
    }
    const end = content.indexOf('\n---', 3);
    if (end < 0) {
        return `---\njarvis_id: ${newId}\n---\n${content}`;
    }
    const frontmatter = content.slice(0, end);
    const replaced = frontmatter.replace(/^jarvis_id:.*$/m, `jarvis_id: ${newId}`);
    const rest = content.slice(end);
    return `${replaced}${rest}`;
}

interface ScannedFile {
    realPath: string;
    virtualPath: string;
    id: string;
    mtime: number;
}

export class DocumentIdentityIndex implements IDocumentIdentityIndex {
    private readonly idToPath = new Map<string, string>();
    private readonly pathToId = new Map<string, string>();

    resolve(id: string): string | undefined {
        return this.idToPath.get(id);
    }

    resolveByPath(path: string): string | undefined {
        return this.pathToId.get(path);
    }

    remap(fromPath: string, toPath: string): void {
        const affectedPaths: Array<{ from: string; to: string }> = [];

        for (const [vPath] of this.pathToId) {
            if (vPath === fromPath || vPath.startsWith(`${fromPath}/`)) {
                const suffix = vPath.slice(fromPath.length);
                affectedPaths.push({ from: vPath, to: `${toPath}${suffix}` });
            }
        }

        for (const { from, to } of affectedPaths) {
            const id = this.pathToId.get(from);
            if (id) {
                this.pathToId.delete(from);
                this.pathToId.set(to, id);
                this.idToPath.set(id, to);
            }
        }
    }

    async assignId(virtualPath: string, realPath: string): Promise<string> {
        const existing = this.pathToId.get(virtualPath);
        if (existing) {
            return existing;
        }

        const id = generateUlid();
        let content: string;
        try {
            content = await fs.readFile(realPath, 'utf8');
        } catch {
            content = '';
        }

        const newContent = content.startsWith('---')
            ? (parseFrontmatterJarvisId(content) ? replaceJarvisId(content, id) : insertJarvisId(content, id))
            : insertJarvisId(content, id);

        await fs.writeFile(realPath, newContent, 'utf8');
        this.idToPath.set(id, virtualPath);
        this.pathToId.set(virtualPath, id);
        return id;
    }

    async initialize(rootRealPath: string, rootVirtualPath: string): Promise<void> {
        this.idToPath.clear();
        this.pathToId.clear();

        const scanned: ScannedFile[] = [];
        await this.scanDirectory(rootRealPath, rootVirtualPath, scanned);

        const idGroups = new Map<string, ScannedFile[]>();
        for (const file of scanned) {
            const group = idGroups.get(file.id) ?? [];
            group.push(file);
            idGroups.set(file.id, group);
        }

        for (const [id, files] of idGroups) {
            if (files.length === 1) {
                this.idToPath.set(id, files[0].virtualPath);
                this.pathToId.set(files[0].virtualPath, id);
                continue;
            }

            files.sort((a, b) => a.mtime - b.mtime);
            const original = files[0];
            this.idToPath.set(id, original.virtualPath);
            this.pathToId.set(original.virtualPath, id);

            for (let i = 1; i < files.length; i++) {
                const duplicate = files[i];
                console.warn(
                    `[DocumentIdentityIndex] Duplicate jarvis_id "${id}" detected in "${duplicate.realPath}" and "${original.realPath}". Re-assigning ID to newer file.`
                );
                const newId = generateUlid();
                try {
                    const content = await fs.readFile(duplicate.realPath, 'utf8');
                    const newContent = replaceJarvisId(content, newId);
                    await fs.writeFile(duplicate.realPath, newContent, 'utf8');
                } catch (error) {
                    console.error(`[DocumentIdentityIndex] Failed to re-assign ID for "${duplicate.realPath}":`, error);
                    continue;
                }
                this.idToPath.set(newId, duplicate.virtualPath);
                this.pathToId.set(duplicate.virtualPath, newId);
            }
        }
    }

    private async scanDirectory(realDirPath: string, virtualDirPath: string, results: ScannedFile[]): Promise<void> {
        let entries: import('node:fs').Dirent<string>[];
        try {
            entries = await fs.readdir(realDirPath, { withFileTypes: true, encoding: 'utf8' });
        } catch {
            return;
        }

        for (const entry of entries) {
            const entryName = typeof entry.name === 'string' ? entry.name : String(entry.name);
            const realChildPath = path.join(realDirPath, entryName);
            const virtualChildPath = virtualDirPath === '/' ? `/${entryName}` : `${virtualDirPath}/${entryName}`;

            if (entry.isDirectory()) {
                await this.scanDirectory(realChildPath, virtualChildPath, results);
            } else if (entry.isFile() && (entryName.endsWith('.md') || entryName.endsWith('.markdown'))) {
                try {
                    const [content, stats] = await Promise.all([
                        fs.readFile(realChildPath, 'utf8'),
                        fs.stat(realChildPath)
                    ]);
                    const id = parseFrontmatterJarvisId(content);
                    if (id) {
                        results.push({
                            realPath: realChildPath,
                            virtualPath: virtualChildPath,
                            id,
                            mtime: stats.mtimeMs
                        });
                    }
                } catch {
                    // skip unreadable files
                }
            }
        }
    }
}
