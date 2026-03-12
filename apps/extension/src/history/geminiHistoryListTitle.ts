function firstNonEmpty(values: Array<string | null | undefined>): string {
    for (const value of values) {
        const trimmed = value?.trim();
        if (trimmed) {
            return trimmed;
        }
    }

    return '';
}

function normalizeHistoryTitle(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function queryFirstMatching(item: Element, selectorList: string): Element | null {
    const selectors = selectorList
        .split(',')
        .map((selector) => selector.trim())
        .filter(Boolean);

    for (const selector of selectors) {
        if (item.matches(selector)) {
            return item;
        }

        const matched = item.querySelector(selector);
        if (matched) {
            return matched;
        }
    }

    return null;
}

export function extractHistoryItemTitle(
    item: Element,
    titleSelector: string,
    linkElement: HTMLAnchorElement | null
): string {
    const titleElement = queryFirstMatching(item, titleSelector);
    const rawTitle = firstNonEmpty([
        titleElement?.textContent,
        titleElement?.getAttribute('aria-label'),
        titleElement?.getAttribute('title'),
        titleElement?.getAttribute('data-title'),
        linkElement?.getAttribute('aria-label'),
        linkElement?.getAttribute('title'),
        linkElement?.getAttribute('data-title'),
        linkElement?.textContent,
        item.textContent
    ]);

    return normalizeHistoryTitle(rawTitle);
}
