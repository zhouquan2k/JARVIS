import { describe, expect, it } from 'vitest';
import { cleanupGeminiAssistantText, cleanupGeminiUserText, extractGeminiMessageText, serializeDomToMarkdown } from './geminiMessageSerializer';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

type MockNode = MockTextNode | MockElement;

class MockTextNode {
    nodeType = TEXT_NODE;
    parentElement: MockElement | null = null;

    constructor(public textContent: string) {}
}

class MockElement {
    nodeType = ELEMENT_NODE;
    parentElement: MockElement | null = null;
    childNodes: MockNode[];
    children: MockElement[];
    classList: Set<string>;

    constructor(
        public tagName: string,
        children: MockNode[] = [],
        private readonly attributes: Record<string, string> = {},
        classNames: string[] = []
    ) {
        this.childNodes = children;
        this.children = children.filter((child): child is MockElement => child instanceof MockElement);
        this.classList = new Set(classNames);

        for (const child of children) {
            child.parentElement = this;
        }
    }

    get textContent(): string {
        return this.childNodes.map((child) => child.textContent || '').join('');
    }

    getAttribute(name: string): string | null {
        return this.attributes[name] ?? null;
    }

    hasAttribute(name: string): boolean {
        return Object.prototype.hasOwnProperty.call(this.attributes, name);
    }

    querySelector(selector: string): MockElement | null {
        return this.querySelectorAll(selector)[0] ?? null;
    }

    querySelectorAll(selector: string): MockElement[] {
        const selectors = selector.split(',').map((item) => item.trim().toUpperCase());
        const results: MockElement[] = [];
        const visit = (node: MockNode) => {
            if (!(node instanceof MockElement)) {
                return;
            }

            if (selectors.includes(node.tagName.toUpperCase())) {
                results.push(node);
            }

            node.childNodes.forEach(visit);
        };

        this.childNodes.forEach(visit);
        return results;
    }
}

describe('cleanupGeminiUserText', () => {
    it('removes visible Gemini prefixes from user prompts', () => {
        expect(cleanupGeminiUserText('你说\n第一行问题\n第二行问题')).toBe('第一行问题\n第二行问题');
        expect(cleanupGeminiUserText('You said: ship it')).toBe('ship it');
    });
});

describe('cleanupGeminiAssistantText', () => {
    it('removes visible Gemini prefixes from assistant responses', () => {
        expect(cleanupGeminiAssistantText('Gemini 说\n可以这样做')).toBe('可以这样做');
        expect(cleanupGeminiAssistantText('Gemini said: ship it')).toBe('ship it');
        expect(cleanupGeminiAssistantText('Gemini 回答\n第一行\n第二行')).toBe('第一行\n第二行');
        expect(cleanupGeminiAssistantText('Gemini\n保留正文')).toBe('保留正文');
        expect(cleanupGeminiAssistantText('\u200BGemini 说：\n保留正文')).toBe('保留正文');
        expect(cleanupGeminiAssistantText('\n\nGemini 说\n\n保留正文')).toBe('保留正文');
        expect(cleanupGeminiAssistantText('# Gemini 说\n保留正文')).toBe('保留正文');
        expect(cleanupGeminiAssistantText('**Gemini 说**\n保留正文')).toBe('保留正文');
    });
});

describe('extractGeminiMessageText', () => {
    it('serializes assistant rich content into markdownish text', () => {
        const element = new MockElement('MODEL-RESPONSE', [
            new MockElement('H2', [new MockTextNode('实施步骤')]),
            new MockElement('P', [
                new MockTextNode('先执行 '),
                new MockElement('CODE', [new MockTextNode('pnpm test')]),
                new MockTextNode('。')
            ]),
            new MockElement('UL', [
                new MockElement('LI', [new MockTextNode('检查单测')]),
                new MockElement('LI', [new MockTextNode('检查构建')])
            ]),
            new MockElement('PRE', [
                new MockElement('CODE', [
                    new MockTextNode('const value = 1;\nconsole.log(value);')
                ], {}, ['language-ts'])
            ]),
            new MockElement('BLOCKQUOTE', [
                new MockElement('P', [new MockTextNode('注意环境变量')])
            ])
        ]);

        expect(extractGeminiMessageText(element as unknown as Element, 'assistant')).toBe([
            '## 实施步骤',
            '',
            '先执行 `pnpm test`。',
            '',
            '- 检查单测',
            '- 检查构建',
            '',
            '```ts',
            'const value = 1;',
            'console.log(value);',
            '```',
            '',
            '> 注意环境变量'
        ].join('\n'));
    });

    it('drops leading assistant speaker headings from realistic Gemini content blocks', () => {
        const element = new MockElement('MODEL-RESPONSE', [
            new MockElement('H1', [new MockTextNode('Gemini 说')]),
            new MockElement('P', [new MockTextNode('这个问题的原因非常清晰：文件索引还在，但物理数据丢失了。')]),
            new MockElement('OL', [
                new MockElement('LI', [new MockTextNode('先检查元数据层')]),
                new MockElement('LI', [new MockTextNode('再检查物理存储层')])
            ])
        ]);

        expect(extractGeminiMessageText(element as unknown as Element, 'assistant')).toBe([
            '这个问题的原因非常清晰：文件索引还在，但物理数据丢失了。',
            '',
            '1. 先检查元数据层',
            '2. 再检查物理存储层'
        ].join('\n'));
    });
});

describe('serializeDomToMarkdown — inline formatting', () => {
    it('restores strong / em / link markdown syntax', () => {
        const element = new MockElement('DIV', [
            new MockElement('P', [
                new MockTextNode('请优先 '),
                new MockElement('STRONG', [new MockTextNode('立即')]),
                new MockTextNode(' 处理，参考 '),
                new MockElement('A', [new MockTextNode('文档')], { href: 'https://example.com' }),
                new MockTextNode(' 与 '),
                new MockElement('EM', [new MockTextNode('附录')]),
                new MockTextNode('。')
            ])
        ]);

        expect(serializeDomToMarkdown(element as unknown as Element)).toBe(
            '请优先 **立即** 处理，参考 [文档](https://example.com) 与 *附录*。'
        );
    });

    it('keeps anchor text when href is missing', () => {
        const element = new MockElement('P', [
            new MockElement('A', [new MockTextNode('裸链接文本')])
        ]);
        expect(serializeDomToMarkdown(element as unknown as Element)).toBe('裸链接文本');
    });
});
