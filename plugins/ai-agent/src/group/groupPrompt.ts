import type { GroupMember } from './groupTypes';
import type { ProviderContextMessage } from '../interfaces/IModelProvider';

// 提示词措辞对齐 openteam 的协作群聊（buildCollaborativePrompt / formatContextMessage，zh-CN）。
// JARVIS 的 GroupMember 不含 description/persona，故省略 openteam 的「职责 / 人设 / 引用」块。

/** openteam: `请使用中文回复，除非用户明确要求其他语言。` */
const RESPONSE_LANGUAGE_INSTRUCTION = '请使用中文回复，除非用户明确要求其他语言。';

function joinSections(sections: Array<string | undefined>): string {
    return sections.filter((section): section is string => Boolean(section?.trim())).join('\n\n');
}

/** openteam buildMemberList：`群聊成员：\n- A\n- B`。 */
export function buildMemberList(members: GroupMember[]): string {
    const list = members.map((member) => `- ${member.name}`).join('\n');
    return `群聊成员：\n${list}`;
}

/**
 * openteam 群聊系统说明（含成员名册 + 自我身份）。
 * 即使没有历史，也会注入，让成员「感知自己处于群聊」。
 */
export function buildGroupPreamble(self: GroupMember, allMembers: GroupMember[]): string {
    return joinSections([
        '你正在一个 AI 群聊中。',
        buildMemberList(allMembers),
        `你的身份是「${self.name}」。`
    ]);
}

/**
 * 从 history 的「最后一条 assistant 消息」中解析上一轮各成员的发言。
 * group 的合并 transcript 形如 `### {成员名}\n{内容}`，按段切分后排除 self。
 * 对应 openteam 的「你上次之后，群聊里有这些新内容」上下文块（formatContextMessage：`{成员名}：{内容}`）。
 */
export function extractPreviousRoundReplies(
    history: ProviderContextMessage[] | undefined,
    self: GroupMember,
    allMembers: GroupMember[]
): string {
    const lastAssistant = [...(history ?? [])].reverse().find((message) => message.role === 'assistant');
    if (!lastAssistant) return '';

    const sections = parseTranscriptSections(lastAssistant.content);
    if (sections.length === 0) return '';

    const memberNames = new Set(allMembers.map((member) => member.name));
    const others = sections.filter(
        (section) => section.name !== self.name && memberNames.has(section.name) && section.content.trim() !== ''
    );
    if (others.length === 0) return '';

    const formatted = others.map((section) => `${section.name}：${section.content.trim()}`).join('\n\n');
    return `你上次之后，群聊里有这些新内容：\n${formatted}`;
}

interface TranscriptSection {
    name: string;
    content: string;
}

function parseTranscriptSections(transcript: string): TranscriptSection[] {
    const lines = transcript.split('\n');
    const sections: TranscriptSection[] = [];
    let current: TranscriptSection | null = null;

    for (const line of lines) {
        const headerMatch = /^### (.+)$/.exec(line);
        if (headerMatch) {
            if (current) sections.push(current);
            current = { name: headerMatch[1].trim(), content: '' };
        } else if (current) {
            current.content += current.content === '' ? line : `\n${line}`;
        }
    }
    if (current) sections.push(current);

    return sections;
}

/**
 * 组装单个成员本轮收到的完整 prompt，对齐 openteam buildCollaborativePrompt 的段落顺序：
 * 群聊说明 + 成员名册 + 身份 + 上一轮他人发言 + 用户最新消息 + 回复指令。
 */
export function composeMemberPrompt(
    self: GroupMember,
    allMembers: GroupMember[],
    history: ProviderContextMessage[] | undefined,
    userPrompt: string
): string {
    return joinSections([
        buildGroupPreamble(self, allMembers),
        extractPreviousRoundReplies(history, self, allMembers),
        `用户最新消息：\n${userPrompt}`,
        `请以「${self.name}」身份回复。你可以参考、补充或反驳其他成员观点。${RESPONSE_LANGUAGE_INSTRUCTION}`
    ]);
}
