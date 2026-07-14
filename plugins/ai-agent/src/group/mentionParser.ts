import type { GroupMember } from './groupTypes';

export interface ParseMentionsResult<T extends GroupMember = GroupMember> {
    targets: T[];
    broadcast: boolean;
}

export function parseMentions<T extends GroupMember>(text: string, members: T[]): ParseMentionsResult<T> {
    const mentionPattern = /@([\w一-龥]+)/g;
    const mentioned: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = mentionPattern.exec(text)) !== null) {
        mentioned.push(match[1].toLowerCase());
    }

    if (mentioned.length === 0) {
        return { targets: members, broadcast: true };
    }

    const targets = members.filter((m) => mentioned.includes(m.name.toLowerCase()));

    if (targets.length === 0) {
        return { targets: members, broadcast: true };
    }

    return { targets, broadcast: false };
}
