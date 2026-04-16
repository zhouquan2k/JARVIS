import type { ContextDocument } from '@packages/core/src';
import { imageViewer } from './imageViewer';
import { markdownViewer } from './markdownViewer';
import { pdfViewer } from './pdfViewer';
import { supportsDocumentMimeType, type DocumentViewerDefinition } from './types';

const DOCUMENT_VIEWERS: DocumentViewerDefinition[] = [
  markdownViewer,
  pdfViewer,
  imageViewer
];

export function getDocumentViewerRegistry(): DocumentViewerDefinition[] {
  return [...DOCUMENT_VIEWERS];
}

export function resolveDocumentViewer(document: ContextDocument): DocumentViewerDefinition | null {
  return DOCUMENT_VIEWERS.find((viewer) => supportsDocumentMimeType(viewer, document)) ?? null;
}
