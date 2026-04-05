import type { DocumentViewerDefinition } from './types';

export const markdownViewer: DocumentViewerDefinition = {
  id: 'text',
  supportedMimeTypes: ['text/markdown', 'text/plain'],
  capabilities: {
    view: true,
    edit: true
  }
};
