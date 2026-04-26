import { encodeTextDocument, type IContextProvider, type WriteContextDocumentResult } from '@packages/core/src';

export interface FileChangeRecord {
    id: string;
    path: string;
    beforeContent: string;
    afterContent: string;
    createdAt: number;
}

export interface LineDiffEntry {
    kind: 'context' | 'added' | 'removed';
    oldLineNumber: number | null;
    newLineNumber: number | null;
    text: string;
}

type FileHistoryState = {
    records: FileChangeRecord[];
    currentIndex: number;
};

function getLineLcsTable(beforeLines: string[], afterLines: string[]): number[][] {
    const table = Array.from({ length: beforeLines.length + 1 }, () => Array(afterLines.length + 1).fill(0));
    for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
        for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
            table[beforeIndex][afterIndex] = beforeLines[beforeIndex] === afterLines[afterIndex]
                ? table[beforeIndex + 1][afterIndex + 1] + 1
                : Math.max(table[beforeIndex + 1][afterIndex], table[beforeIndex][afterIndex + 1]);
        }
    }

    return table;
}

export function buildLineDiffEntries(beforeContent: string, afterContent: string): LineDiffEntry[] {
    const beforeLines = beforeContent.split('\n');
    const afterLines = afterContent.split('\n');
    const table = getLineLcsTable(beforeLines, afterLines);
    const entries: LineDiffEntry[] = [];
    let beforeIndex = 0;
    let afterIndex = 0;
    let oldLineNumber = 1;
    let newLineNumber = 1;

    while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
        if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
            entries.push({
                kind: 'context',
                oldLineNumber,
                newLineNumber,
                text: beforeLines[beforeIndex]
            });
            beforeIndex += 1;
            afterIndex += 1;
            oldLineNumber += 1;
            newLineNumber += 1;
            continue;
        }

        if (table[beforeIndex + 1][afterIndex] >= table[beforeIndex][afterIndex + 1]) {
            entries.push({
                kind: 'removed',
                oldLineNumber,
                newLineNumber: null,
                text: beforeLines[beforeIndex]
            });
            beforeIndex += 1;
            oldLineNumber += 1;
            continue;
        }

        entries.push({
            kind: 'added',
            oldLineNumber: null,
            newLineNumber,
            text: afterLines[afterIndex]
        });
        afterIndex += 1;
        newLineNumber += 1;
    }

    while (beforeIndex < beforeLines.length) {
        entries.push({
            kind: 'removed',
            oldLineNumber,
            newLineNumber: null,
            text: beforeLines[beforeIndex]
        });
        beforeIndex += 1;
        oldLineNumber += 1;
    }

    while (afterIndex < afterLines.length) {
        entries.push({
            kind: 'added',
            oldLineNumber: null,
            newLineNumber,
            text: afterLines[afterIndex]
        });
        afterIndex += 1;
        newLineNumber += 1;
    }

    return entries;
}

export class FileChangeService {
    private readonly historyByPath = new Map<string, FileHistoryState>();

    recordChange(input: Omit<FileChangeRecord, 'id' | 'createdAt'>): FileChangeRecord {
        const record: FileChangeRecord = {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            ...input
        };

        const existing = this.historyByPath.get(record.path);
        const records = existing
            ? existing.records.slice(0, existing.currentIndex + 1)
            : [];

        records.push(record);
        this.historyByPath.set(record.path, {
            records,
            currentIndex: records.length - 1
        });

        return record;
    }

    getCurrentRecord(path: string): FileChangeRecord | null {
        const history = this.historyByPath.get(path);
        if (!history || history.currentIndex < 0) {
            return null;
        }

        return history.records[history.currentIndex] ?? null;
    }

    getVisibleRecord(path: string): FileChangeRecord | null {
        const history = this.historyByPath.get(path);
        if (!history || history.records.length === 0) {
            return null;
        }

        if (history.currentIndex >= 0) {
            return history.records[history.currentIndex] ?? null;
        }

        return history.records[0] ?? null;
    }

    clear(path: string): void {
        this.historyByPath.delete(path);
    }

    canUndo(path: string): boolean {
        const history = this.historyByPath.get(path);
        return !!history && history.currentIndex >= 0;
    }

    canRedo(path: string): boolean {
        const history = this.historyByPath.get(path);
        return !!history && history.currentIndex + 1 < history.records.length;
    }

    async undo(
        path: string,
        provider: IContextProvider
    ): Promise<{ content: string; record: FileChangeRecord | null; writeResult: WriteContextDocumentResult } | null> {
        const history = this.historyByPath.get(path);
        if (!history || history.currentIndex < 0) {
            return null;
        }

        const current = history.records[history.currentIndex];
        const writeResult = await provider.writeDocument({
            path,
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument(current.beforeContent)
        });
        history.currentIndex -= 1;
        return {
            content: current.beforeContent,
            record: history.currentIndex >= 0 ? history.records[history.currentIndex] ?? null : null,
            writeResult
        };
    }

    async redo(
        path: string,
        provider: IContextProvider
    ): Promise<{ content: string; record: FileChangeRecord | null; writeResult: WriteContextDocumentResult } | null> {
        const history = this.historyByPath.get(path);
        if (!history || history.currentIndex + 1 >= history.records.length) {
            return null;
        }

        const nextIndex = history.currentIndex + 1;
        const current = history.records[nextIndex];
        const writeResult = await provider.writeDocument({
            path,
            mimeType: 'text/markdown',
            dataBase64: encodeTextDocument(current.afterContent)
        });
        history.currentIndex = nextIndex;
        return {
            content: current.afterContent,
            record: current,
            writeResult
        };
    }
}
