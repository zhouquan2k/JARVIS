import type { GroupMemberPart } from '../interfaces/Conversation';

/**
 * 固定的英文锚点标题：模型只产出这三个英文二级标题，
 * UI 渲染时再按当前语言替换显示（见 GroupMessageTabs.vue）。
 * 不依赖模型翻译，切换语言可实时更新。
 */
export const SUMMARY_SECTION_ANCHORS = {
    consensus: 'Consensus',
    complementary: 'Complementary',
    conflicts: 'Conflicts'
} as const;

const DEFAULT_SYSTEM_PROMPT = [
    'You are a neutral moderator synthesizing multiple AI models\' responses to the same question.',
    'Your task is to produce a structured summary with exactly three sections.',
    `Use these exact Markdown level-2 headings, in this order: "## ${SUMMARY_SECTION_ANCHORS.consensus}", "## ${SUMMARY_SECTION_ANCHORS.complementary}", "## ${SUMMARY_SECTION_ANCHORS.conflicts}".`,
    '',
    `- **${SUMMARY_SECTION_ANCHORS.consensus}**: Points all models agree on.`,
    `- **${SUMMARY_SECTION_ANCHORS.complementary}**: Insights that are unique to specific models but not contradicted by others. Attribute each with @MemberName.`,
    `- **${SUMMARY_SECTION_ANCHORS.conflicts}**: Points where models disagree. Show each conflicting view with @MemberName attribution.`,
    '',
    'Rules:',
    '- Use @MemberName (matching the member names exactly) to attribute statements to specific members.',
    '- Be concise and objective.',
    '- Do not evaluate which model is better.',
    '- The summary body MUST be written in Simplified Chinese, unless the user explicitly requested another language.',
    '- Do not default to English, even if some member responses contain English phrases.',
    `- The three section headings MUST always be the exact English strings "${SUMMARY_SECTION_ANCHORS.consensus}", "${SUMMARY_SECTION_ANCHORS.complementary}", "${SUMMARY_SECTION_ANCHORS.conflicts}" — do not translate or reword them.`
].join('\n');

export function composeGroupSummaryPrompt(members: GroupMemberPart[], systemPrompt?: string): string {
    const effectiveSystemPrompt = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const memberSection = members
        .filter((m) => m.status === 'done' && m.content)
        .map((m) => `### @${m.name}\n${m.content}`)
        .join('\n\n');

    return `${effectiveSystemPrompt}\n\nHere are the members' responses:\n\n${memberSection}`;
}
