import { describe, expect, it, vi } from 'vitest';
import type { Task } from '@plugins/task-mgr/api';
import { GoogleCalendarSyncService, computeReminderMinutes, resolveCalendarDueAt } from './GoogleCalendarSyncService.ts';

function createTimedTask(overrides: Partial<Task> = {}): Task {
    return {
        id: 'task-1',
        title: 'Timed task',
        notes: 'Bring notes',
        completed: false,
        dueAt: new Date('2026-05-24T09:00:00-04:00').getTime(),
        priority: 'high',
        documentPath: '/docs/guide.md',
        agentKey: null,
        createdAt: 1,
        updatedAt: 1,
        completedAt: null,
        calendarProviderId: null,
        calendarEventId: null,
        calendarSyncStatus: null,
        calendarLastSyncedAt: null,
        calendarLastSyncError: null,
        ...overrides
    };
}

describe('computeReminderMinutes', () => {
    it('skips the same-day 08:00 reminder when the task is earlier than 08:00', () => {
        const dueAt = new Date('2026-05-24T07:30:00-04:00').getTime();
        expect(computeReminderMinutes(dueAt)).toEqual([630, 60]);
    });

    it('deduplicates overlapping reminders', () => {
        const dueAt = new Date('2026-05-24T09:00:00-04:00').getTime();
        expect(computeReminderMinutes(dueAt)).toEqual([720, 60]);
    });
});

describe('resolveCalendarDueAt', () => {
    it('defaults date-only dueAt values to 09:00 local time', () => {
        const dueAt = new Date('2026-05-24T00:00:00').getTime();
        const resolved = new Date(resolveCalendarDueAt(dueAt));
        expect(resolved.getHours()).toBe(9);
        expect(resolved.getMinutes()).toBe(0);
    });
});

describe('GoogleCalendarSyncService', () => {
    it('refreshes an access token and creates a calendar event', async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === 'https://oauth.example.test/token') {
                expect(String(init?.body)).toContain('grant_type=refresh_token');
                return new Response(JSON.stringify({
                    access_token: 'token-1',
                    expires_in: 3600
                }), { status: 200 });
            }

            expect(url).toBe('https://calendar.example.test/v3/calendars/primary/events');
            expect(init?.method).toBe('POST');
            expect(init?.headers).toMatchObject({
                authorization: 'Bearer token-1'
            });
            const payload = JSON.parse(String(init?.body)) as {
                summary: string;
                description: string;
                reminders: { overrides: Array<{ method: string; minutes: number }> };
            };
            expect(payload.summary).toBe('Timed task');
            expect(payload.description).toBe('Bring notes');
            expect(payload.reminders.overrides).toEqual([
                { method: 'popup', minutes: 720 },
                { method: 'popup', minutes: 60 }
            ]);
            return new Response(JSON.stringify({ id: 'event-1' }), { status: 200 });
        });

        const service = new GoogleCalendarSyncService({
            env: {
                CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID: 'client-id',
                CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
                CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN: 'refresh-token',
                CHATPRISM_GOOGLE_OAUTH_TOKEN_URL: 'https://oauth.example.test/token',
                CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL: 'https://calendar.example.test/v3'
            },
            fetchImpl,
            now: () => 1_000
        });

        await expect(service.syncTask(createTimedTask())).resolves.toEqual({
            providerId: 'google-calendar',
            eventId: 'event-1',
            syncedAt: 1_000
        });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('defaults date-only tasks to 09:00 when syncing a calendar event', async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === 'https://oauth.example.test/token') {
                return new Response(JSON.stringify({
                    access_token: 'token-1',
                    expires_in: 3600
                }), { status: 200 });
            }

            const payload = JSON.parse(String(init?.body)) as {
                start: { dateTime: string };
                end: { dateTime: string };
            };
            expect(new Date(payload.start.dateTime).getHours()).toBe(9);
            expect(new Date(payload.start.dateTime).getMinutes()).toBe(0);
            expect(new Date(payload.end.dateTime).getHours()).toBe(9);
            expect(new Date(payload.end.dateTime).getMinutes()).toBe(1);
            return new Response(JSON.stringify({ id: 'event-1' }), { status: 200 });
        });

        const service = new GoogleCalendarSyncService({
            env: {
                CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID: 'client-id',
                CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
                CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN: 'refresh-token',
                CHATPRISM_GOOGLE_OAUTH_TOKEN_URL: 'https://oauth.example.test/token',
                CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL: 'https://calendar.example.test/v3'
            },
            fetchImpl,
            now: () => 1_000
        });

        await expect(service.syncTask(createTimedTask({
            dueAt: new Date('2026-05-24T00:00:00').getTime()
        }))).resolves.toEqual({
            providerId: 'google-calendar',
            eventId: 'event-1',
            syncedAt: 1_000
        });
    });

    it('updates an existing calendar event', async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === 'https://oauth.example.test/token') {
                return new Response(JSON.stringify({
                    access_token: 'token-1',
                    expires_in: 3600
                }), { status: 200 });
            }

            expect(url).toBe('https://calendar.example.test/v3/calendars/primary/events/event-1');
            return new Response(JSON.stringify({ id: 'event-1' }), { status: 200 });
        });

        const service = new GoogleCalendarSyncService({
            env: {
                CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID: 'client-id',
                CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
                CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN: 'refresh-token',
                CHATPRISM_GOOGLE_OAUTH_TOKEN_URL: 'https://oauth.example.test/token',
                CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL: 'https://calendar.example.test/v3'
            },
            fetchImpl
        });

        await service.syncTask(createTimedTask({
            calendarEventId: 'event-1',
            calendarProviderId: 'google-calendar'
        }));
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('surfaces Google OAuth failures', async () => {
        const service = new GoogleCalendarSyncService({
            env: {
                CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID: 'client-id',
                CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
                CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN: 'refresh-token',
                CHATPRISM_GOOGLE_OAUTH_TOKEN_URL: 'https://oauth.example.test/token'
            },
            fetchImpl: async () => new Response(JSON.stringify({
                error: 'invalid_grant'
            }), { status: 400 })
        });

        await expect(service.syncTask(createTimedTask())).rejects.toThrow('Failed to refresh Google OAuth access token.');
    });

    it('deletes an existing calendar event', async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === 'https://oauth.example.test/token') {
                return new Response(JSON.stringify({
                    access_token: 'token-1',
                    expires_in: 3600
                }), { status: 200 });
            }

            expect(url).toBe('https://calendar.example.test/v3/calendars/primary/events/event-1');
            expect(init?.method).toBe('DELETE');
            expect(init?.headers).toMatchObject({
                authorization: 'Bearer token-1'
            });
            return new Response(null, { status: 204 });
        });

        const service = new GoogleCalendarSyncService({
            env: {
                CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID: 'client-id',
                CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
                CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN: 'refresh-token',
                CHATPRISM_GOOGLE_OAUTH_TOKEN_URL: 'https://oauth.example.test/token',
                CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL: 'https://calendar.example.test/v3'
            },
            fetchImpl
        });

        await expect(service.deleteTask(createTimedTask({
            calendarEventId: 'event-1',
            calendarProviderId: 'google-calendar'
        }))).resolves.toBeUndefined();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});
