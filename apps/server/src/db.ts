import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { SCHEMA_STATEMENTS } from './schema.js';
import type { ServerConfig } from './config.js';

export type SyncDatabase = BetterSqlite3.Database;

export function createDatabase(config: ServerConfig): SyncDatabase {
    if (config.dbPath !== ':memory:') {
        fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    }

    const database = new BetterSqlite3(config.dbPath);
    database.pragma('journal_mode = WAL');
    initializeDatabase(database);
    return database;
}

export function initializeDatabase(database: SyncDatabase): void {
    for (const statement of SCHEMA_STATEMENTS) {
        database.exec(statement);
    }
}
