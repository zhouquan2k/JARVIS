import type { Component } from 'vue';
import type { ContextDocument } from '@packages/core/src';

export interface DocumentViewerDefinition {
  id: string;
  supportedMimeTypes: string[];
  capabilities: {
    view: boolean;
    edit: boolean;
  };
  component: Component;
}

export function supportsDocumentMimeType(
  viewer: DocumentViewerDefinition,
  document: Pick<ContextDocument, 'mimeType'>
): boolean {
  return viewer.supportedMimeTypes.includes(document.mimeType);
}
