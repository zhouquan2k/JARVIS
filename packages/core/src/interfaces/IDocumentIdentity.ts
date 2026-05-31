export interface DocumentIdentity {
    id: string;
    currentPath: string;
}

export interface IDocumentIdentityIndex {
    resolve(id: string): string | undefined;
    resolveByPath(path: string): string | undefined;
    remap(fromPath: string, toPath: string): void;
    assignId(virtualPath: string, realPath: string): Promise<string>;
}
