import MarkdownDocumentViewer from './MarkdownDocumentViewer.vue';
import type { DocumentViewerDefinition } from './types';

export const markdownViewer = {
  id: 'text',
  supportedMimeTypes: ['text/markdown', 'text/plain'],
  capabilities: {
    view: true,
    edit: true
  },
  component: MarkdownDocumentViewer
} satisfies DocumentViewerDefinition;
