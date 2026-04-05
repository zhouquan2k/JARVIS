const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8');

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
    text: 'text/plain',
    pdf: 'application/pdf',
    json: 'application/json',
    xml: 'application/xml',
    yml: 'application/yaml',
    yaml: 'application/yaml',
    csv: 'text/csv',
    html: 'text/html',
    htm: 'text/html'
};

function stripDataUriPrefix(value: string): string {
    const marker = ';base64,';
    const markerIndex = value.indexOf(marker);
    if (markerIndex === -1) {
        return value;
    }

    return value.slice(markerIndex + marker.length);
}

export function encodeBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }

    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

export function decodeBase64(base64Value: string): Uint8Array {
    const normalized = stripDataUriPrefix(base64Value);

    if (typeof Buffer !== 'undefined') {
        return Uint8Array.from(Buffer.from(normalized, 'base64'));
    }

    const binary = atob(normalized);
    const output = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        output[index] = binary.charCodeAt(index);
    }

    return output;
}

export function encodeTextDocument(text: string): string {
    return encodeBase64(TEXT_ENCODER.encode(text));
}

export function decodeTextDocument(dataBase64: string): string {
    return TEXT_DECODER.decode(decodeBase64(dataBase64));
}

export function inferDocumentMimeType(path: string): string {
    const fileName = path.split('/').pop() ?? path;
    const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : '';
    return MIME_TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export function isTextDocumentMimeType(mimeType: string): boolean {
    return mimeType.startsWith('text/')
        || mimeType === 'application/json'
        || mimeType === 'application/xml'
        || mimeType === 'application/yaml';
}
