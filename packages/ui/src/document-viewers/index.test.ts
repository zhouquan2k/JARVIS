import { describe, expect, it } from 'vitest';
import { getDocumentViewerRegistry, resolveDocumentViewer, resolveDocumentViewerById } from './index';

describe('document-viewers registry', () => {
  it('exposes the built-in viewers and resolves them by mime type and id', () => {
    const registry = getDocumentViewerRegistry();

    expect(registry.map((viewer) => viewer.id)).toEqual(['text', 'pdf', 'image']);
    expect(resolveDocumentViewer({ mimeType: 'text/markdown' } as never)?.id).toBe('text');
    expect(resolveDocumentViewer({ mimeType: 'application/pdf' } as never)?.id).toBe('pdf');
    expect(resolveDocumentViewer({ mimeType: 'image/png' } as never)?.id).toBe('image');
    expect(resolveDocumentViewerById('text')?.id).toBe('text');
    expect(resolveDocumentViewerById('missing')).toBeNull();
  });
});
