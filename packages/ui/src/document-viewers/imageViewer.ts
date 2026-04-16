import type { DocumentViewerDefinition } from './types';

export const imageViewer: DocumentViewerDefinition = {
  id: 'image',
  supportedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'],
  capabilities: {
    view: true,
    edit: false
  }
};
