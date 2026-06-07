import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { BilibiliTranscriptService } from './BilibiliTranscriptService.ts';

function createProcess(stdoutText: string, stderrText = '', exitCode = 0) {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const emitter = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        on(event: 'error' | 'close', listener: (...args: unknown[]) => void): typeof emitter;
    };
    emitter.stdout = stdout;
    emitter.stderr = stderr;

    queueMicrotask(() => {
        stdout.end(stdoutText);
        stderr.end(stderrText);
        emitter.emit('close', exitCode);
    });

    return emitter;
}

describe('BilibiliTranscriptService', () => {
    it('uses browser cookies by default and downloads subtitles via write-subs', async () => {
        const spawnCalls: Array<{ command: string; args: readonly string[]; cwd?: string }> = [];
        const service = new BilibiliTranscriptService({
            spawnImpl: (command, args, options) => {
                spawnCalls.push({ command, args, cwd: options.cwd });
                if (args.includes('--dump-single-json')) {
                    return createProcess(JSON.stringify({ title: 'Demo Video' }));
                }

                writeFileSync(
                    path.join(options.cwd!, 'Demo Video [BV12A5P6oEsK].ai-zh.srt'),
                    '1\n00:00:00,000 --> 00:00:01,000\n第一行\n'
                );
                return createProcess('');
            }
        });

        await expect(service.fetch('https://www.bilibili.com/video/BV12A5P6oEsK')).resolves.toEqual({
            title: 'Demo Video',
            transcript: '第一行'
        });
        expect(spawnCalls).toHaveLength(2);
        expect(spawnCalls[0]).toEqual({
            command: 'yt-dlp',
            cwd: undefined,
            args: [
                '--add-header',
                'Origin:https://www.bilibili.com',
                '--add-header',
                'Referer:https://www.bilibili.com',
                '--cookies-from-browser',
                'chrome:Default',
                '--dump-single-json',
                '--skip-download',
                'https://www.bilibili.com/video/BV12A5P6oEsK'
            ]
        });
        expect(spawnCalls[1]?.args).toEqual([
            '--add-header',
            'Origin:https://www.bilibili.com',
            '--add-header',
            'Referer:https://www.bilibili.com',
            '--cookies-from-browser',
            'chrome:Default',
            '--skip-download',
            '--write-subs',
            '--sub-langs',
            'ai-zh,zh-Hans,zh-CN,zh,zh-TW,en',
            '--output',
            '%(title)s [%(id)s].%(ext)s',
            'https://www.bilibili.com/video/BV12A5P6oEsK'
        ]);
        expect(spawnCalls[1]?.cwd).toMatch(/bilibili-transcript-/u);
    });

    it('normalizes downloaded json3 subtitles into plain transcript text', async () => {
        const service = new BilibiliTranscriptService({
            spawnImpl: (command, args, options) => {
                if (args.includes('--dump-single-json')) {
                    return createProcess(JSON.stringify({ title: '  Demo Video  ' }));
                }

                writeFileSync(
                    path.join(options.cwd!, 'Demo Video [BV1xx411c7mD].zh-Hans.json3'),
                    JSON.stringify({
                        events: [
                            {
                                segs: [{ utf8: '第一行 ' }, { utf8: '字幕' }]
                            },
                            {
                                segs: [{ utf8: '第二行字幕' }]
                            },
                            {
                                segs: [{ utf8: '第二行字幕' }]
                            }
                        ]
                    })
                );
                return createProcess('');
            }
        });

        await expect(service.fetch('https://www.bilibili.com/video/BV1xx411c7mD')).resolves.toEqual({
            title: 'Demo Video',
            transcript: '第一行 字幕\n第二行字幕'
        });
    });
});
