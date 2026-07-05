export interface WorkspaceAnnotationRange {
    start: number;
    end: number;
}

export interface WorkspaceCiteAnnotation {
    kind: 'cite';
    range: WorkspaceAnnotationRange;
    payload: {
        refId: string;
        label: string;
        title?: string;
        url?: string;
        snippet?: string;
    };
}

export interface WorkspaceImageGroupAnnotation {
    kind: 'image_group';
    range: WorkspaceAnnotationRange | null;
    payload: {
        groupId: string;
        images: Array<{
            id: string;
            mimeType: string;
            alt?: string;
            previewBase64?: string;
            remoteUrl?: string;
            width?: number;
            height?: number;
        }>;
    };
}

export type WorkspaceMessageAnnotation = WorkspaceCiteAnnotation | WorkspaceImageGroupAnnotation;
