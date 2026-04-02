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

function firstLine(value: string | null | undefined): string {
    return normalizeHistoryTitle((value ?? '').split(/\r?\n/u)[0] ?? '');
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
    const titleElement = queryFirstMatching(
        item,
        [titleSelector, '.conversation-title', '[data-test-id="conversation-title"]', '[role="heading"]', 'h1, h2, h3, h4, h5, h6']
            .filter(Boolean)
            .join(', ')
    );
    const rawTitle = firstNonEmpty([
        firstLine(titleElement?.textContent),
        titleElement?.getAttribute('aria-label'),
        titleElement?.getAttribute('title'),
        titleElement?.getAttribute('data-title'),
        linkElement?.getAttribute('aria-label'),
        linkElement?.getAttribute('title'),
        linkElement?.getAttribute('data-title'),
        firstLine(linkElement?.textContent),
        item.getAttribute('aria-label'),
        item.getAttribute('title'),
        item.getAttribute('data-title'),
        firstLine(item.textContent)
    ]);

    return normalizeHistoryTitle(rawTitle);
}
