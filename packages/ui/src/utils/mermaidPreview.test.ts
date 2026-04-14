// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest';
import { renderMermaidPreview } from './mermaidPreview';

const mermaidMock = vi.hoisted(() => ({
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({
        svg: `<svg data-render-id="${id}"></svg>`
    }))
}));

vi.mock('mermaid', () => ({
    default: {
        initialize: mermaidMock.initialize,
        render: mermaidMock.render
    }
}));

describe('mermaidPreview', () => {
    it('returns null for non-mermaid code blocks', () => {
        const applyPreview = vi.fn();

        expect(renderMermaidPreview('ts', 'const value = 1;', applyPreview)).toBeNull();
        expect(applyPreview).not.toHaveBeenCalled();
    });

    it('initializes mermaid lazily and applies rendered SVG preview', async () => {
        const applyPreview = vi.fn();

        renderMermaidPreview('mermaid', 'graph TD; A-->B;', applyPreview);
        await vi.waitFor(() => {
            expect(mermaidMock.initialize).toHaveBeenCalledWith({
                startOnLoad: false,
                securityLevel: 'strict',
                htmlLabels: false,
                theme: 'dark',
                themeVariables: {
                    background: '#080d14',
                    mainBkg: '#111827',
                    primaryColor: '#111827',
                    primaryTextColor: '#f8fafc',
                    textColor: '#f8fafc',
                    classText: '#f8fafc',
                    nodeBorder: '#38bdf8',
                    lineColor: '#cbd5e1'
                }
            });
            expect(mermaidMock.render).toHaveBeenCalledWith(expect.stringMatching(/^markdown-mermaid-/), 'graph TD; A-->B;');
        });

        expect(applyPreview).toHaveBeenCalledWith('');
        const preview = applyPreview.mock.calls.at(-1)?.[0] as HTMLElement;
        expect(preview.dataset.testid).toBe('markdown-mermaid-preview');
        expect(preview.querySelector('svg')).not.toBeNull();
    });

    it('converts render failures into bounded preview errors', async () => {
        mermaidMock.render.mockRejectedValueOnce(new Error('bad diagram'));
        const applyPreview = vi.fn();

        renderMermaidPreview('mermaid', 'broken', applyPreview);
        await vi.waitFor(() => {
            const preview = applyPreview.mock.calls.at(-1)?.[0] as HTMLElement;
            expect(preview.dataset.testid).toBe('markdown-mermaid-error');
        });

        const preview = applyPreview.mock.calls.at(-1)?.[0] as HTMLElement;
        expect(preview.dataset.testid).toBe('markdown-mermaid-error');
        expect(preview.textContent).toContain('bad diagram');
    });
});
