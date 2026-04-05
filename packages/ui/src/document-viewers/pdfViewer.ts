import type { DocumentViewerDefinition } from './types';

export const pdfViewer: DocumentViewerDefinition = {
  id: 'pdf',
  supportedMimeTypes: ['application/pdf'],
  capabilities: {
    view: true,
    edit: false
  }
};
