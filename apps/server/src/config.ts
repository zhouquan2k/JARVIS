import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ServerConfig {
    port: number;
    dbPath: string;
    isDevelopment: boolean;
    corsAllowlist: string[];
    knowledgeRoot?: string;
    contextBackend: 'local-file' | 'database';
    codexCommand: string;
    codexWorkingDirectory: string;
}

const SERVER_ROOT = fileURLToPath(new URL('../', import.meta.url));

function parsePort(value?: string): number {
    if (!value) {
        return 8787;
    }

    const port = Number.parseInt(value, 10);
    return Number.isInteger(port) && port > 0 ? port : 8787;
}

function parseAllowlist(value?: string): string[] {
    if (!value) {
        return [];
    }

    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseContextBackend(value?: string): 'local-file' | 'database' {
    return value === 'database' ? 'database' : 'local-file';
}

export function resolveServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
    return {
        port: parsePort(env.PORT),
        dbPath: env.CHATPRISM_SYNC_DB_PATH || path.join(SERVER_ROOT, '.data', 'sync.sqlite'),
        isDevelopment: env.NODE_ENV !== 'production',
        corsAllowlist: parseAllowlist(env.CHATPRISM_SYNC_ALLOWED_ORIGINS),
        knowledgeRoot: env.CHATPRISM_KNOWLEDGE_ROOT?.trim() || undefined,
        contextBackend: parseContextBackend(env.CHATPRISM_CONTEXT_BACKEND),
        codexCommand: env.CHATPRISM_CODEX_COMMAND?.trim() || 'codex',
        codexWorkingDirectory: env.CHATPRISM_CODEX_CWD?.trim() || process.cwd()
    };
}
