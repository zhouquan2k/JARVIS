import { computed, inject } from 'vue';
import type { DocumentCreationFlowContribution } from '@packages/core';
import { contributionQueryKey } from '../plugins/injectionKeys';

export function useDocumentCreationFlows() {
    const contributionQuery = inject(contributionQueryKey, null);

    return computed<readonly DocumentCreationFlowContribution[]>(() => {
        return contributionQuery?.value?.getDocumentCreationFlows() ?? [];
    });
}
