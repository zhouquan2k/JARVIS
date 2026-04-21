import PdfDocumentViewer from './PdfDocumentViewer.vue';
import type { DocumentViewerDefinition } from './types';

export const pdfViewer = {
  id: 'pdf',
  supportedMimeTypes: ['application/pdf'],
  capabilities: {
    view: true,
    edit: false
  },
  component: PdfDocumentViewer
} satisfies DocumentViewerDefinition;
