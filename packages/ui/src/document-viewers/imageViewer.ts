import ImageDocumentViewer from './ImageDocumentViewer.vue';
import type { DocumentViewerDefinition } from './types';

export const imageViewer = {
  id: 'image',
  supportedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'],
  capabilities: {
    view: true,
    edit: false
  },
  component: ImageDocumentViewer
} satisfies DocumentViewerDefinition;
