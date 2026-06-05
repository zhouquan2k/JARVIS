import type { InsertLinkItem } from '@packages/core/src';

export interface ResolvedInsertLinkType {
    id: string;
    title: string;
    titleKey?: string;
    items: InsertLinkItem[];
}
