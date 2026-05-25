import { describe, expect, it, vi } from 'vitest';
import { CodexAuthService } from '../src/services/codexAuthService.js';

describe('CodexAuthService', () => {
    it('treats codex login status exit code 0 as authenticated', async () => {
        const spawnImpl = vi.fn((_command: string, _args: string[]) => {
            return {
                stdout: {
                    on(event: string, listener: (chunk: string) => void) {
                        if (event === 'data') {
                            listener('Logged in using ChatGPT');
                        }
                    }
                },
                stderr: { on: vi.fn() },
                on(event: string, listener: (value?: number) => void) {
                    if (event === 'close') {
                        listener(0);
                    }
                }
            };
        }) as unknown as typeof import('node:child_process').spawn;

        const service = new CodexAuthService({ spawnImpl });
        await expect(service.getAuthStatus()).resolves.toEqual({
            authenticated: true,
            providerId: 'chatgpt-codex',
            message: 'Logged in using ChatGPT'
        });
    });

    it('extracts verificationUri and userCode from device auth output', async () => {
        const spawnImpl = vi.fn((_command: string, _args: string[]) => {
            return {
                stdout: {
                    on(event: string, listener: (chunk: string) => void) {
                        if (event === 'data') {
                            listener('Open https://chatgpt.com/auth/device and enter code: ABCD-EFGH');
                        }
                    }
                },
                stderr: { on: vi.fn() },
                on(event: string, listener: (value?: number) => void) {
                    if (event === 'close') {
                        listener(0);
                    }
                }
            };
        }) as unknown as typeof import('node:child_process').spawn;

        const service = new CodexAuthService({ spawnImpl });
        await expect(service.startLogin()).resolves.toEqual({
            mode: 'device-auth',
            verificationUri: 'https://chatgpt.com/auth/device',
            userCode: 'ABCD-EFGH',
            message: 'Open https://chatgpt.com/auth/device and enter code: ABCD-EFGH'
        });
    });
});
