import type { ContextDocument } from '@packages/core/src';
import { imageViewer } from './imageViewer';
import { markdownViewer } from './markdownViewer';
import { pdfViewer } from './pdfViewer';
import { supportsDocumentMimeType, type DocumentViewerDefinition } from './types';

export type { DocumentViewerDefinition } from './types';
export { imageViewer } from './imageViewer';
export { markdownViewer } from './markdownViewer';
export { pdfViewer } from './pdfViewer';

const DOCUMENT_VIEWERS: readonly DocumentViewerDefinition[] = [
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

export function resolveDocumentViewerById(id: string): DocumentViewerDefinition | null {
  return DOCUMENT_VIEWERS.find((viewer) => viewer.id === id) ?? null;
}
