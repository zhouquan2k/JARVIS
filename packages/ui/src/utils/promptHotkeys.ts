export function isPromptSubmitHotkey(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>): boolean {
    if (event.key !== 'Enter') {
        return false;
    }

    return event.ctrlKey || event.metaKey;
}
