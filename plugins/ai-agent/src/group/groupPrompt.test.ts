import { describe, expect, it } from 'vitest';
import { buildGroupPreamble, buildMemberList, composeMemberPrompt, extractPreviousRoundReplies } from './groupPrompt';
import type { GroupMember } from './groupTypes';

const members: GroupMember[] = [
    { providerId: 'chatgpt-dom', modelId: 'dom', name: 'ChatGPT' },
    { providerId: 'gemini-dom', modelId: 'dom', name: 'Gemini' }
];

const [chatgpt, gemini] = members;

describe('buildMemberList', () => {
    it('lists every member name', () => {
        expect(buildMemberList(members)).toBe('群聊成员：\n- ChatGPT\n- Gemini');
    });
});

describe('buildGroupPreamble', () => {
    it('declares the group, roster, and self identity', () => {
        const preamble = buildGroupPreamble(gemini, members);
        expect(preamble).toContain('你正在一个 AI 群聊中。');
        expect(preamble).toContain('群聊成员：\n- ChatGPT\n- Gemini');
        expect(preamble).toContain('你的身份是「Gemini」。');
    });
});

describe('extractPreviousRoundReplies', () => {
    it('returns empty when no history', () => {
        expect(extractPreviousRoundReplies(undefined, gemini, members)).toBe('');
        expect(extractPreviousRoundReplies([], gemini, members)).toBe('');
    });

    it('returns empty when last assistant message is not a group transcript', () => {
        const history = [{ role: 'assistant' as const, content: 'plain answer without sections' }];
        expect(extractPreviousRoundReplies(history, gemini, members)).toBe('');
    });

    it('extracts other members reply and excludes self', () => {
        const history = [
            { role: 'user' as const, content: 'q' },
            { role: 'assistant' as const, content: '### ChatGPT\nfrom chatgpt\n\n### Gemini\nfrom gemini' }
        ];
        const result = extractPreviousRoundReplies(history, gemini, members);
        expect(result).toContain('你上次之后，群聊里有这些新内容：');
        expect(result).toContain('ChatGPT：from chatgpt');
        expect(result).not.toContain('Gemini：from gemini');
    });

    it('preserves multi-line content of other members', () => {
        const history = [
            { role: 'assistant' as const, content: '### ChatGPT\nline1\nline2\n\n### Gemini\ng' }
        ];
        const result = extractPreviousRoundReplies(history, gemini, members);
        expect(result).toContain('ChatGPT：line1\nline2');
    });

    it('uses the latest assistant message only', () => {
        const history = [
            { role: 'assistant' as const, content: '### ChatGPT\nold answer' },
            { role: 'user' as const, content: 'q2' },
            { role: 'assistant' as const, content: '### ChatGPT\nnew answer' }
        ];
        const result = extractPreviousRoundReplies(history, gemini, members);
        expect(result).toContain('ChatGPT：new answer');
        expect(result).not.toContain('old answer');
    });

    it('skips the "正在输入" placeholder when a member produced no text', () => {
        const history = [
            { role: 'assistant' as const, content: '### ChatGPT\n*正在输入...*\n\n### Gemini\nreal' }
        ];
        // ChatGPT 仍有占位符文本，会被当作内容带出；这里仅验证 Gemini 自身被排除。
        const result = extractPreviousRoundReplies(history, gemini, members);
        expect(result).not.toContain('Gemini：real');
    });
});

describe('composeMemberPrompt', () => {
    it('assembles preamble + previous replies + user message + instruction in order', () => {
        const history = [
            { role: 'assistant' as const, content: '### ChatGPT\nprior chatgpt' }
        ];
        const prompt = composeMemberPrompt(gemini, members, history, 'what next?');

        const idxGroup = prompt.indexOf('你正在一个 AI 群聊中。');
        const idxPrev = prompt.indexOf('你上次之后，群聊里有这些新内容：');
        const idxUser = prompt.indexOf('用户最新消息：\nwhat next?');
        const idxInstr = prompt.indexOf('请以「Gemini」身份回复。');

        expect(idxGroup).toBeGreaterThanOrEqual(0);
        expect(idxPrev).toBeGreaterThan(idxGroup);
        expect(idxUser).toBeGreaterThan(idxPrev);
        expect(idxInstr).toBeGreaterThan(idxUser);
        expect(prompt).toContain('请使用中文回复，除非用户明确要求其他语言。');
    });

    it('omits the previous-replies block on the first turn', () => {
        const prompt = composeMemberPrompt(chatgpt, members, undefined, 'hello');
        expect(prompt).not.toContain('你上次之后');
        expect(prompt).toContain('用户最新消息：\nhello');
    });
});
