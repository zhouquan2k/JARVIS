import { computed, inject } from 'vue';
import type { DocumentImportContribution } from '@packages/core';
import { contributionQueryKey } from '../plugins/injectionKeys';

export function useDocumentImports() {
    const contributionQuery = inject(contributionQueryKey, null);

    return computed<readonly DocumentImportContribution[]>(() => {
        return contributionQuery?.value?.getDocumentImports() ?? [];
    });
}
