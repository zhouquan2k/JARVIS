import { describe, expect, it } from 'vitest';
import { parseMentions } from './mentionParser';
import type { GroupMember } from './groupTypes';

const members: GroupMember[] = [
    { providerId: 'chatgpt-codex', modelId: 'auto', name: 'ChatGPT' },
    { providerId: 'gemini-api', modelId: 'gemini-2.5-flash', name: 'Gemini' }
];

describe('parseMentions', () => {
    it('no mention → broadcast all members', () => {
        const result = parseMentions('Hello, what is TypeScript?', members);
        expect(result.broadcast).toBe(true);
        expect(result.targets).toEqual(members);
    });

    it('single matching mention → only that member, not broadcast', () => {
        const result = parseMentions('Hey @ChatGPT, explain generics', members);
        expect(result.broadcast).toBe(false);
        expect(result.targets).toHaveLength(1);
        expect(result.targets[0].name).toBe('ChatGPT');
    });

    it('multiple mentions → all matched members, not broadcast', () => {
        const result = parseMentions('@ChatGPT @Gemini compare your approaches', members);
        expect(result.broadcast).toBe(false);
        expect(result.targets).toHaveLength(2);
    });

    it('unknown @name → falls back to broadcast', () => {
        const result = parseMentions('@UnknownBot answer this', members);
        expect(result.broadcast).toBe(true);
        expect(result.targets).toEqual(members);
    });

    it('case-insensitive matching', () => {
        const result = parseMentions('@chatgpt lowercase test', members);
        expect(result.broadcast).toBe(false);
        expect(result.targets[0].name).toBe('ChatGPT');
    });
});
