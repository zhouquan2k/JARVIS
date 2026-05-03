export type MermaidPreviewValue = null | string | HTMLElement;
export type MermaidPreviewRenderer = (value: MermaidPreviewValue) => void;

let mermaidModulePromise: Promise<typeof import('mermaid').default> | null = null;
let renderSequence = 0;

async function loadMermaid() {
    if (!mermaidModulePromise) {
        mermaidModulePromise = import('mermaid').then((module) => {
            module.default.initialize({
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
            return module.default;
        });
    }

    return mermaidModulePromise;
}

function createErrorPreview(error: unknown): HTMLElement {
    const container = document.createElement('pre');
    container.className = 'markdown-mermaid-error';
    container.dataset.testid = 'markdown-mermaid-error';
    container.textContent = error instanceof Error && error.message
        ? error.message
        : 'Unable to render Mermaid diagram.';
    return container;
}

export function renderMermaidPreview(
    language: string,
    content: string,
    applyPreview: MermaidPreviewRenderer
): string | HTMLElement | null {
    if (language.trim().toLowerCase() !== 'mermaid') {
        return null;
    }

    const source = content.trim();
    if (!source) {
        applyPreview(null);
        return null;
    }

    const renderId = `markdown-mermaid-${++renderSequence}`;
    applyPreview('');

    void loadMermaid()
        .then(async (mermaid) => {
            const result = await mermaid.render(renderId, source);
            const container = document.createElement('div');
            container.className = 'markdown-mermaid-preview';
            container.dataset.testid = 'markdown-mermaid-preview';
            container.innerHTML = result.svg;
            applyPreview(container);
        })
        .catch((error) => {
            applyPreview(createErrorPreview(error));
        });

    return '';
}
