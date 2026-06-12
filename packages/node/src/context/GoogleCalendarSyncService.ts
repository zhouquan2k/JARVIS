import type { Task, TaskRecurrence } from '@plugins/task-mgr/api';
import type { ITaskCalendarSyncService, TaskCalendarSyncResult } from './ITaskCalendarSyncService.ts';

const GOOGLE_CALENDAR_PROVIDER_ID = 'google-calendar';
const DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_CALENDAR_API_BASE_URL = 'https://www.googleapis.com/calendar/v3';
interface GoogleCalendarTokenResponse {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    error?: string;
    error_description?: string;
}

interface GoogleCalendarEventResponse {
    id?: string;
    error?: {
        errors?: Array<{
            domain?: string;
            reason?: string;
            message?: string;
            location?: string;
            locationType?: string;
        }>;
        message?: string;
    };
}

export interface GoogleCalendarSyncServiceOptions {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    now?: () => number;
}

export class GoogleCalendarSyncService implements ITaskCalendarSyncService {
    private readonly env: Record<string, string | undefined>;
    private readonly fetchImpl: typeof fetch;
    private readonly now: () => number;
    private accessToken: { value: string; expiresAt: number } | null = null;

    constructor(options: GoogleCalendarSyncServiceOptions = {}) {
        if (!options.fetchImpl && typeof fetch === 'undefined') {
            throw new Error('The current environment does not support fetch.');
        }

        this.env = options.env ?? process.env;
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.now = options.now ?? Date.now;
    }

    async syncTask(task: Task): Promise<TaskCalendarSyncResult> {
        const dueAt = task.dueAt;
        if (typeof dueAt !== 'number' || !Number.isFinite(dueAt)) {
            throw new Error('Calendar sync requires a dueAt value.');
        }

        const config = this.getConfig();
        console.info('[google-calendar-sync] syncing task', {
            taskId: task.id,
            title: task.title,
            dueAt,
            calendarId: config.calendarId,
            eventMode: task.calendarEventId ? 'update' : 'create'
        });
        const accessToken = await this.getAccessToken(config);
        const calendarDueAt = resolveCalendarDueAt(dueAt);
        const reminderMinutes = computeReminderMinutes(calendarDueAt);
        const timeZone = resolveLocalTimeZone();
        const startDate = new Date(calendarDueAt);
        const endDate = new Date(calendarDueAt + 60_000);
        const recurrenceRule = task.recurrence ? buildRecurrenceRule(task.recurrence) : null;
        const payload: Record<string, unknown> = {
            summary: task.title,
            description: task.notes,
            start: {
                dateTime: startDate.toISOString(),
                timeZone
            },
            end: {
                dateTime: endDate.toISOString(),
                timeZone
            },
            transparency: 'transparent',
            reminders: {
                useDefault: false,
                overrides: reminderMinutes.map((minutes) => ({
                    method: 'popup',
                    minutes
                }))
            }
        };
        if (recurrenceRule) {
            payload.recurrence = [recurrenceRule];
        }

        const isUpdate = Boolean(task.calendarEventId);
        const requestUrl = isUpdate
            ? `${config.calendarApiBaseUrl}/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(task.calendarEventId!)}`
            : `${config.calendarApiBaseUrl}/calendars/${encodeURIComponent(config.calendarId)}/events`;
        console.info('[google-calendar-sync] sending calendar event request', {
            taskId: task.id,
            method: isUpdate ? 'PUT' : 'POST',
            requestUrl,
            reminderMinutes,
            timeZone,
            recurrence: task.recurrence ?? null,
            payload
        });
        const response = await this.fetchImpl(requestUrl, {
            method: isUpdate ? 'PUT' : 'POST',
            headers: {
                authorization: `Bearer ${accessToken}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const responseJson = await parseJson<GoogleCalendarEventResponse>(response);
        if (!response.ok || !responseJson.id) {
            console.error('[google-calendar-sync] calendar event request failed', {
                taskId: task.id,
                status: response.status,
                payload,
                response: summarizeErrorPayload(responseJson),
                errorDetails: extractGoogleErrorDetails(responseJson)
            });
            throw new Error(resolveGoogleCalendarError(responseJson, response.status, 'Failed to sync Google Calendar event.'));
        }

        console.info('[google-calendar-sync] calendar event request succeeded', {
            taskId: task.id,
            status: response.status,
            eventId: responseJson.id
        });

        return {
            providerId: GOOGLE_CALENDAR_PROVIDER_ID,
            eventId: responseJson.id,
            syncedAt: this.now()
        };
    }

    async deleteTask(task: Task): Promise<void> {
        if (!task.calendarEventId) {
            console.info('[google-calendar-sync] skipping calendar event deletion because no event id is present', {
                taskId: task.id
            });
            return;
        }

        const config = this.getConfig();
        console.info('[google-calendar-sync] deleting calendar event', {
            taskId: task.id,
            calendarId: config.calendarId,
            eventId: task.calendarEventId
        });
        const accessToken = await this.getAccessToken(config);
        const requestUrl = `${config.calendarApiBaseUrl}/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(task.calendarEventId)}`;
        const response = await this.fetchImpl(requestUrl, {
            method: 'DELETE',
            headers: {
                authorization: `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            const responseJson = await parseJson<GoogleCalendarEventResponse>(response);
            console.error('[google-calendar-sync] calendar event deletion failed', {
                taskId: task.id,
                status: response.status,
                response: summarizeErrorPayload(responseJson),
                errorDetails: extractGoogleErrorDetails(responseJson)
            });
            throw new Error(resolveGoogleCalendarError(responseJson, response.status, 'Failed to delete Google Calendar event.'));
        }

        console.info('[google-calendar-sync] calendar event deletion succeeded', {
            taskId: task.id,
            status: response.status,
            eventId: task.calendarEventId
        });
    }

    private getConfig(): {
        clientId: string;
        clientSecret: string;
        refreshToken: string;
        calendarId: string;
        tokenUrl: string;
        calendarApiBaseUrl: string;
    } {
        const clientId = this.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID?.trim();
        const clientSecret = this.env.CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
        const refreshToken = this.env.CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN?.trim();
        const calendarId = this.env.CHATPRISM_GOOGLE_CALENDAR_ID?.trim() || 'primary';
        const tokenUrl = this.env.CHATPRISM_GOOGLE_OAUTH_TOKEN_URL?.trim() || DEFAULT_TOKEN_URL;
        const calendarApiBaseUrl = (this.env.CHATPRISM_GOOGLE_CALENDAR_API_BASE_URL?.trim() || DEFAULT_CALENDAR_API_BASE_URL).replace(/\/+$/, '');

        if (!clientId || !clientSecret || !refreshToken) {
            throw new Error('Google Calendar sync is not configured. Set CHATPRISM_GOOGLE_CALENDAR_CLIENT_ID, CHATPRISM_GOOGLE_CALENDAR_CLIENT_SECRET, and CHATPRISM_GOOGLE_CALENDAR_REFRESH_TOKEN.');
        }

        console.info('[google-calendar-sync] loaded calendar sync config', {
            calendarId,
            tokenUrl,
            calendarApiBaseUrl,
            clientId: maskSecret(clientId),
            clientSecret: maskSecret(clientSecret),
            refreshToken: maskSecret(refreshToken)
        });

        return {
            clientId,
            clientSecret,
            refreshToken,
            calendarId,
            tokenUrl,
            calendarApiBaseUrl
        };
    }

    private async getAccessToken(config: {
        clientId: string;
        clientSecret: string;
        refreshToken: string;
        tokenUrl: string;
    }): Promise<string> {
        const cached = this.accessToken;
        if (cached && cached.expiresAt > this.now() + 30_000) {
            console.info('[google-calendar-sync] using cached access token', {
                expiresAt: cached.expiresAt
            });
            return cached.value;
        }

        console.info('[google-calendar-sync] refreshing OAuth access token', {
            tokenUrl: config.tokenUrl,
            clientId: maskSecret(config.clientId),
            refreshToken: maskSecret(config.refreshToken)
        });
        const response = await this.fetchImpl(config.tokenUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                refresh_token: config.refreshToken,
                grant_type: 'refresh_token'
            }).toString()
        });
        const responseJson = await parseJson<GoogleCalendarTokenResponse>(response);
        if (!response.ok || !responseJson.access_token) {
            console.error('[google-calendar-sync] OAuth access token refresh failed', {
                status: response.status,
                response: summarizeErrorPayload(responseJson)
            });
            throw new Error(resolveGoogleCalendarError(responseJson, response.status, 'Failed to refresh Google OAuth access token.'));
        }

        const expiresInMs = Math.max(60, responseJson.expires_in ?? 3600) * 1000;
        this.accessToken = {
            value: responseJson.access_token,
            expiresAt: this.now() + expiresInMs
        };
        console.info('[google-calendar-sync] OAuth access token refresh succeeded', {
            status: response.status,
            expiresInSeconds: responseJson.expires_in ?? 3600,
            expiresAt: this.accessToken.expiresAt
        });
        return responseJson.access_token;
    }
}

export function computeReminderMinutes(dueAt: number): number[] {
    const dueDate = new Date(dueAt);
    const reminders = new Set<number>();
    const previousDayNinePm = new Date(dueAt);
    previousDayNinePm.setDate(previousDayNinePm.getDate() - 1);
    previousDayNinePm.setHours(21, 0, 0, 0);
    const sameDayEightAm = new Date(dueAt);
    sameDayEightAm.setHours(8, 0, 0, 0);
    const oneHourBefore = new Date(dueAt - 60 * 60 * 1000);

    addReminderMinutes(reminders, dueDate, previousDayNinePm);
    if (sameDayEightAm.getTime() < dueDate.getTime()) {
        addReminderMinutes(reminders, dueDate, sameDayEightAm);
    }
    addReminderMinutes(reminders, dueDate, oneHourBefore);

    return Array.from(reminders).sort((left, right) => right - left);
}

export function resolveCalendarDueAt(dueAt: number): number {
    const dueDate = new Date(dueAt);
    if (dueDate.getHours() === 0
        && dueDate.getMinutes() === 0
        && dueDate.getSeconds() === 0
        && dueDate.getMilliseconds() === 0) {
        const adjusted = new Date(dueAt);
        adjusted.setHours(9, 0, 0, 0);
        return adjusted.getTime();
    }

    return dueAt;
}

function addReminderMinutes(reminders: Set<number>, dueDate: Date, reminderDate: Date): void {
    const diffMinutes = Math.round((dueDate.getTime() - reminderDate.getTime()) / 60_000);
    if (diffMinutes < 0 || diffMinutes > 40_320) {
        return;
    }

    reminders.add(diffMinutes);
}

async function parseJson<T>(response: Response): Promise<T> {
    const text = await response.text();
    if (!text.trim()) {
        return {} as T;
    }

    try {
        return JSON.parse(text) as T;
    } catch {
        return {} as T;
    }
}

function resolveGoogleCalendarError(
    responseJson: GoogleCalendarTokenResponse | GoogleCalendarEventResponse,
    status: number,
    fallbackMessage: string
): string {
    if ('error_description' in responseJson && responseJson.error_description) {
        return `${fallbackMessage} ${responseJson.error_description}`;
    }
    if ('error' in responseJson && typeof responseJson.error === 'string' && responseJson.error) {
        return `${fallbackMessage} ${responseJson.error}`;
    }
    if ('error' in responseJson && responseJson.error && typeof responseJson.error === 'object' && responseJson.error.message) {
        return `${fallbackMessage} ${responseJson.error.message}`;
    }
    return `${fallbackMessage} HTTP ${status}.`;
}

function resolveLocalTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function maskSecret(value: string): string {
    if (value.length <= 8) {
        return `${value.slice(0, 2)}***`;
    }

    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function summarizeErrorPayload(value: unknown): unknown {
    if (value && typeof value === 'object') {
        return JSON.parse(JSON.stringify(value));
    }
    return value;
}

function extractGoogleErrorDetails(responseJson: GoogleCalendarEventResponse): Array<{
    domain?: string;
    reason?: string;
    message?: string;
    location?: string;
    locationType?: string;
}> | null {
    const error = responseJson.error;
    if (!error || typeof error !== 'object' || !Array.isArray((error as { errors?: unknown }).errors)) {
        return null;
    }

    return (error as {
        errors: Array<{
            domain?: string;
            reason?: string;
            message?: string;
            location?: string;
            locationType?: string;
        }>;
    }).errors.map((item) => ({
        domain: item.domain,
        reason: item.reason,
        message: item.message,
        location: item.location,
        locationType: item.locationType
    }));
}

export function buildRecurrenceRule(recurrence: NonNullable<TaskRecurrence>): string {
    const freqMap: Record<NonNullable<TaskRecurrence>, string> = {
        daily: 'DAILY',
        weekly: 'WEEKLY',
        monthly: 'MONTHLY'
    };
    return `RRULE:FREQ=${freqMap[recurrence]}`;
}
