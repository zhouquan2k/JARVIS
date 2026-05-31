import { spawn } from 'node:child_process';

type SpawnOptions = {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: ['ignore', 'pipe', 'pipe'];
};

type SpawnedProcess = {
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    on(event: 'error', listener: (error: Error) => void): SpawnedProcess;
    on(event: 'close', listener: (code: number | null) => void): SpawnedProcess;
};

const defaultSpawnImpl = (command: string, args: readonly string[], options: SpawnOptions): SpawnedProcess => {
    return spawn(command, [...args], options) as unknown as SpawnedProcess;
};

export interface CodexAuthServiceOptions {
    command?: string;
    cwd?: string;
    spawnImpl?: (command: string, args: readonly string[], options: SpawnOptions) => SpawnedProcess;
}

export interface CodexAuthStatusResult {
    authenticated: boolean;
    providerId: 'chatgpt-codex';
    message?: string;
}

export interface CodexLoginStartResult {
    mode: 'device-auth';
    verificationUri?: string;
    userCode?: string;
    message: string;
}

const URL_PATTERN = /https?:\/\/\S+/iu;
const USER_CODE_PATTERN = /\b(?:code|user code)[:\s]+([A-Z0-9-]{4,})\b/iu;

function parseVerificationUri(output: string): string | undefined {
    return output.match(URL_PATTERN)?.[0];
}

function parseUserCode(output: string): string | undefined {
    return output.match(USER_CODE_PATTERN)?.[1];
}

async function runCommand(
    spawnImpl: (command: string, args: readonly string[], options: SpawnOptions) => SpawnedProcess,
    command: string,
    args: string[],
    cwd: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawnImpl(command, args, {
            cwd,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
        });
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
        });
        child.on('error', reject);
        child.on('close', (code: number | null) => {
            resolve({ code, stdout, stderr });
        });
    });
}

export class CodexAuthService {
    private readonly command: string;
    private readonly cwd: string;
    private readonly spawnImpl: (command: string, args: readonly string[], options: SpawnOptions) => SpawnedProcess;

    constructor(options: CodexAuthServiceOptions = {}) {
        this.command = options.command?.trim() || 'codex';
        this.cwd = options.cwd?.trim() || process.cwd();
        this.spawnImpl = options.spawnImpl ?? defaultSpawnImpl;
    }

    async getAuthStatus(): Promise<CodexAuthStatusResult> {
        const result = await runCommand(this.spawnImpl, this.command, ['login', 'status'], this.cwd);
        const combined = `${result.stdout}\n${result.stderr}`.trim();
        return {
            authenticated: result.code === 0,
            providerId: 'chatgpt-codex',
            message: combined || undefined
        };
    }

    async startLogin(): Promise<CodexLoginStartResult> {
        const result = await runCommand(this.spawnImpl, this.command, ['login', '--device-auth'], this.cwd);
        const combined = `${result.stdout}\n${result.stderr}`.trim();

        if (result.code !== 0 && !combined) {
            throw new Error('Failed to start Codex login.');
        }

        return {
            mode: 'device-auth',
            verificationUri: parseVerificationUri(combined),
            userCode: parseUserCode(combined),
            message: combined || 'Codex device authentication was started.'
        };
    }
}
