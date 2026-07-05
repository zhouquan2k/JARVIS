import { describe, expect, it } from 'vitest';
import { normalizeTaskPushRequest, normalizeTaskRecord } from '../src/types/sync.js';

describe('sync task normalizer', () => {
    it('strips unknown fields while preserving whitelisted task fields', () => {
        const task = normalizeTaskRecord({
            id: 'task-1',
            title: 'Review spec',
            notes: '',
            completed: false,
            dueAt: null,
            priority: 'medium',
            executionState: 'doing',
            documentPath: '/docs/spec.md',
            documentId: 'doc-1',
            agentKey: '/team/',
            createdAt: 100,
            updatedAt: 200,
            completedAt: null,
            calendarProviderId: null,
            calendarEventId: null,
            calendarSyncStatus: null,
            calendarLastSyncedAt: null,
            calendarLastSyncError: null,
            recurrence: 'weekly',
            unexpected: 'drop-me'
        });

        expect(task).toEqual({
            id: 'task-1',
            title: 'Review spec',
            notes: '',
            completed: false,
            dueAt: null,
            priority: 'medium',
            executionState: 'doing',
            documentPath: '/docs/spec.md',
            documentId: 'doc-1',
            agentKey: '/team/',
            createdAt: 100,
            updatedAt: 200,
            completedAt: null,
            calendarProviderId: null,
            calendarEventId: null,
            calendarSyncStatus: null,
            calendarLastSyncedAt: null,
            calendarLastSyncError: null,
            recurrence: 'weekly'
        });
        expect(task).not.toHaveProperty('unexpected');
    });

    it('rejects invalid task payloads without partial acceptance', () => {
        expect(() => normalizeTaskPushRequest({
            tasks: [
                {
                    id: 'task-1',
                    title: '',
                    notes: '',
                    completed: false,
                    createdAt: 100,
                    updatedAt: 100
                }
            ]
        })).toThrow('task.title');
    });
});
