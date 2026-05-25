import { describe, expect, it, vi } from 'vitest';
import { CodexCliService } from '../src/services/codexCliService.js';

describe('CodexCliService', () => {
    it('returns the fixed ChatGPT-account model catalog', async () => {
        const spawnImpl = vi.fn((_command: string, args: string[]) => {
            expect(args).toEqual(['login', 'status']);
            return {
                stdout: {
                    on: vi.fn()
                },
                stderr: {
                    on(event: string, listener: (chunk: string) => void) {
                        if (event === 'data') {
                            listener('WARNING: proceeding, even though we could not update PATH: Operation not permitted (os error 1)\n');
                            listener('Logged in using ChatGPT\n');
                        }
                    }
                },
                on(event: string, listener: (value?: number) => void) {
                    if (event === 'close') {
                        listener(0);
                    }
                }
            };
        }) as unknown as typeof import('node:child_process').spawn;
        const service = new CodexCliService({ spawnImpl });
        await expect(service.getModelCatalog()).resolves.toEqual({
            models: [
                {
                    id: 'gpt-5.5',
                    name: 'gpt-5.5',
                    options: [
                        expect.objectContaining({ key: 'web_search' }),
                        expect.objectContaining({ key: 'deep_research' })
                    ]
                },
                {
                    id: 'gpt-5.4',
                    name: 'gpt-5.4',
                    options: [
                        expect.objectContaining({ key: 'web_search' }),
                        expect.objectContaining({ key: 'deep_research' })
                    ]
                },
                {
                    id: 'gpt-5.4-mini',
                    name: 'gpt-5.4-mini',
                    options: [
                        expect.objectContaining({ key: 'web_search' }),
                        expect.objectContaining({ key: 'deep_research' })
                    ]
                }
            ],
            defaultModel: 'gpt-5.5'
        });
    });

    it('returns the static fallback model catalog when debug models fails for non-ChatGPT auth', async () => {
        const spawnImpl = vi.fn((_command: string, args: string[]) => {
            if (args[0] === 'login') {
                return {
                    stdout: {
                        on(event: string, listener: (chunk: string) => void) {
                            if (event === 'data') {
                                listener('Logged in using API key\n');
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
            }

            expect(args).toEqual(['debug', 'models']);
            return {
                stdout: { on: vi.fn() },
                stderr: {
                    on(event: string, listener: (chunk: string) => void) {
                        if (event === 'data') {
                            listener('boom');
                        }
                    }
                },
                on(event: string, listener: (value?: number) => void) {
                    if (event === 'close') {
                        listener(1);
                    }
                }
            };
        }) as unknown as typeof import('node:child_process').spawn;
        const service = new CodexCliService({ spawnImpl });
        await expect(service.getModelCatalog()).resolves.toEqual({
            models: [
                {
                    id: 'auto',
                    name: 'Auto (Default)',
                    options: [
                        expect.objectContaining({ key: 'web_search' }),
                        expect.objectContaining({ key: 'deep_research' })
                    ]
                }
            ],
            defaultModel: 'auto'
        });
    });

    it('parses the real model catalog from codex debug models', async () => {
        const spawnImpl = vi.fn((_command: string, args: string[]) => {
            if (args[0] === 'login') {
                return {
                    stdout: {
                        on(event: string, listener: (chunk: string) => void) {
                            if (event === 'data') {
                                listener('Logged in using API key\n');
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
            }

            expect(args).toEqual(['debug', 'models']);
            return {
                stdout: {
                    on(event: string, listener: (chunk: string) => void) {
                        if (event === 'data') {
                            listener(JSON.stringify({
                                models: [
                                    {
                                        slug: 'gpt-5.4',
                                        display_name: 'GPT-5.4',
                                        supported_in_api: true,
                                        visibility: 'list',
                                        priority: 0
                                    },
                                    {
                                        slug: 'gpt-5.3-codex',
                                        display_name: 'gpt-5.3-codex',
                                        supported_in_api: true,
                                        visibility: 'list',
                                        priority: 1
                                    }
                                ]
                            }));
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

        const service = new CodexCliService({ spawnImpl });
        await expect(service.getModelCatalog()).resolves.toEqual({
            models: [
                {
                    id: 'gpt-5.4',
                    name: 'GPT-5.4',
                    options: [
                        expect.objectContaining({ key: 'web_search' }),
                        expect.objectContaining({ key: 'deep_research' })
                    ]
                },
                {
                    id: 'gpt-5.3-codex',
                    name: 'gpt-5.3-codex',
                    options: [
                        expect.objectContaining({ key: 'web_search' }),
                        expect.objectContaining({ key: 'deep_research' })
                    ]
                }
            ],
            defaultModel: 'gpt-5.4'
        });
    });

    it('normalizes the current codex exec JSON event stream into updates and a final result', async () => {
        const spawnImpl = vi.fn((_command: string, args: string[]) => {
            expect(args).not.toContain('--model');
            return {
                stdout: {
                    on(event: string, listener: (chunk: string) => void) {
                        if (event === 'data') {
                            listener([
                                '{"type":"thread.started","thread_id":"thread-1"}',
                                '{"type":"item.completed","item":{"id":"item-0","type":"error","message":"ignored warning"}}',
                                '{"type":"turn.started"}',
                                '{"type":"item.completed","item":{"id":"item-1","type":"agent_message","text":"Hello world"}}'
                            ].join('\n') + '\n');
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

        const service = new CodexCliService({ spawnImpl });
        const events: string[] = [];
        const result = await service.runChat({ prompt: 'hi', options: { modelId: 'codex' } }, (event) => {
            if (event.type === 'message.delta') {
                events.push(event.delta);
            }
        });

        expect(events).toEqual(['Hello world']);
        expect(result.text).toBe('Hello world');
    });

    it('passes through an explicit non-default model id', async () => {
        const spawnImpl = vi.fn((_command: string, _args: string[]) => {
            expect(_args).toContain('--model');
            expect(_args).toContain('gpt-5-codex');
            return {
                stdout: {
                    on(event: string, listener: (chunk: string) => void) {
                        if (event === 'data') {
                            listener('{"delta":"Hello"}\n{"delta":" world"}\n');
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

        const service = new CodexCliService({ spawnImpl });
        await service.runChat({ prompt: 'hi', options: { modelId: 'gpt-5-codex' } }, () => undefined);
    });
});
