import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type SpawnOptions = {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdio?: ['ignore', 'pipe', 'pipe'];
};

type SpawnedProcess = {
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    on(event: 'error', listener: (error: Error) => void): SpawnedProcess;
    on(event: 'close', listener: (code: number | null) => void): SpawnedProcess;
};

type MetadataRecord = {
    title?: unknown;
};

export interface BilibiliTranscriptFetchResult {
    title: string;
    transcript: string;
}

export interface BilibiliTranscriptServiceOptions {
    command?: string;
    cwd?: string;
    cookiesFromBrowser?: string | false;
    spawnImpl?: (command: string, args: readonly string[], options: SpawnOptions) => SpawnedProcess;
}

const defaultSpawnImpl = (command: string, args: readonly string[], options: SpawnOptions): SpawnedProcess => {
    return spawn(command, [...args], options) as unknown as SpawnedProcess;
};

const PREFERRED_LANGS = ['ai-zh', 'zh-Hans', 'zh-CN', 'zh', 'zh-TW', 'en'];
const BILIBILI_ORIGIN = 'https://www.bilibili.com';

function normalizeLine(text: string): string {
    return text
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeTranscriptText(lines: string[]): string {
    const normalized: string[] = [];

    for (const line of lines.map(normalizeLine)) {
        if (!line) {
            continue;
        }

        if (normalized[normalized.length - 1] === line) {
            continue;
        }

        normalized.push(line);
    }

    return normalized.join('\n');
}

function normalizeJson3Transcript(raw: string): string {
    const payload = JSON.parse(raw) as {
        events?: Array<{
            segs?: Array<{
                utf8?: unknown;
            }>;
        }>;
    };

    const lines = (payload.events ?? []).map((event) => {
        return (event.segs ?? [])
            .map((segment) => typeof segment.utf8 === 'string' ? segment.utf8 : '')
            .join('');
    });

    return normalizeTranscriptText(lines);
}

function normalizeVttTranscript(raw: string): string {
    const lines = raw
        .split(/\r?\n/u)
        .filter((line) => line.trim())
        .filter((line) => !/^WEBVTT/iu.test(line))
        .filter((line) => !/^\d+$/u.test(line.trim()))
        .filter((line) => !/^\d{2}:\d{2}:\d{2}\.\d+\s+-->\s+\d{2}:\d{2}:\d{2}\.\d+/u.test(line.trim()));

    return normalizeTranscriptText(lines);
}

function normalizeSrtTranscript(raw: string): string {
    const lines = raw
        .split(/\r?\n/u)
        .filter((line) => line.trim())
        .filter((line) => !/^\d+$/u.test(line.trim()))
        .filter((line) => !/^\d{2}:\d{2}:\d{2},\d+\s+-->\s+\d{2}:\d{2}:\d{2},\d+/u.test(line.trim()));

    return normalizeTranscriptText(lines);
}

function normalizeTranscriptByFormat(raw: string, ext: string): string {
    if (ext === 'json3' || ext === 'srv3') {
        return normalizeJson3Transcript(raw);
    }

    if (ext === 'vtt') {
        return normalizeVttTranscript(raw);
    }

    if (ext === 'srt') {
        return normalizeSrtTranscript(raw);
    }

    return normalizeTranscriptText(raw.split(/\r?\n/u));
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString('utf8');
}

function runYtDlp(
    command: string,
    args: readonly string[],
    options: SpawnOptions,
    spawnImpl: NonNullable<BilibiliTranscriptServiceOptions['spawnImpl']>
): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawnImpl(command, args, {
            ...options,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const stdoutPromise = readStream(child.stdout);
        const stderrPromise = readStream(child.stderr);

        child.on('error', reject);
        child.on('close', async (code) => {
            const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
            if (code !== 0) {
                reject(new Error(`yt-dlp exited with code ${code}: ${stderr.trim() || 'unknown error'}`));
                return;
            }

            resolve(stdout);
        });
    });
}

export class BilibiliTranscriptService {
    private readonly command: string;
    private readonly cwd?: string;
    private readonly cookiesFromBrowser: string | false;
    private readonly spawnImpl: NonNullable<BilibiliTranscriptServiceOptions['spawnImpl']>;

    constructor(options: BilibiliTranscriptServiceOptions = {}) {
        this.command = options.command?.trim() || 'yt-dlp';
        this.cwd = options.cwd;
        this.cookiesFromBrowser = options.cookiesFromBrowser === false
            ? false
            : options.cookiesFromBrowser?.trim() || 'chrome:Default';
        this.spawnImpl = options.spawnImpl ?? defaultSpawnImpl;
    }

    async fetch(url: string, options: { signal?: AbortSignal } = {}): Promise<BilibiliTranscriptFetchResult> {
        const trimmedUrl = url.trim();
        if (!trimmedUrl) {
            throw new Error('Bilibili URL is required.');
        }

        const ytDlpArgs = [
            '--add-header',
            `Origin:${BILIBILI_ORIGIN}`,
            '--add-header',
            `Referer:${BILIBILI_ORIGIN}`,
            ...(this.cookiesFromBrowser ? ['--cookies-from-browser', this.cookiesFromBrowser] : []),
            '--dump-single-json',
            '--skip-download',
            trimmedUrl
        ];

        const stdout = await runYtDlp(
            this.command,
            ytDlpArgs,
            {
                cwd: this.cwd,
                env: process.env
            },
            this.spawnImpl
        );

        let metadata: MetadataRecord;
        try {
            metadata = JSON.parse(stdout) as MetadataRecord;
        } catch (error) {
            throw new Error(`Failed to parse yt-dlp metadata: ${error instanceof Error ? error.message : String(error)}`);
        }

        const title = typeof metadata.title === 'string' && metadata.title.trim()
            ? metadata.title.trim()
            : 'Imported Bilibili video';
        const transcript = await this.downloadTranscript(trimmedUrl, options.signal);
        if (!transcript) {
            throw new Error('Fetched subtitle track was empty after normalization.');
        }

        return {
            title,
            transcript
        };
    }

    private async downloadTranscript(url: string, signal?: AbortSignal): Promise<string> {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bilibili-transcript-'));

        try {
            const ytDlpArgs = [
                '--add-header',
                `Origin:${BILIBILI_ORIGIN}`,
                '--add-header',
                `Referer:${BILIBILI_ORIGIN}`,
                ...(this.cookiesFromBrowser ? ['--cookies-from-browser', this.cookiesFromBrowser] : []),
                '--skip-download',
                '--write-subs',
                '--sub-langs',
                PREFERRED_LANGS.join(','),
                '--output',
                '%(title)s [%(id)s].%(ext)s',
                url
            ];

            await runYtDlp(
                this.command,
                ytDlpArgs,
                {
                    cwd: tempDir,
                    env: process.env
                },
                this.spawnImpl
            );

            const subtitleFile = await this.pickSubtitleFile(tempDir);
            if (!subtitleFile) {
                throw new Error('No subtitle track was available for this Bilibili video.');
            }

            const rawSubtitle = await fs.readFile(path.join(tempDir, subtitleFile.name), 'utf8');
            signal?.throwIfAborted();
            return normalizeTranscriptByFormat(rawSubtitle, subtitleFile.ext);
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    }

    private async pickSubtitleFile(tempDir: string): Promise<{ name: string; ext: string } | null> {
        const entries = await fs.readdir(tempDir, { withFileTypes: true });
        const files = entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name);

        for (const lang of PREFERRED_LANGS) {
            const match = files.find((name) => name.includes(`.${lang}.`));
            if (match) {
                return {
                    name: match,
                    ext: path.extname(match).slice(1) || 'plain'
                };
            }
        }

        const fallback = files.find((name) => /\.(srt|vtt|json3|srv3)$/iu.test(name));
        if (!fallback) {
            return null;
        }

        return {
            name: fallback,
            ext: path.extname(fallback).slice(1) || 'plain'
        };
    }
}
