import { describe, expect, it } from 'vitest';
import { HttpApiError } from '../../interfaces/HttpApiError';
import { HttpContextProvider } from './HttpContextProvider';

describe('HttpContextProvider', () => {
    it('returns parsed context payloads', async () => {
        const provider = new HttpContextProvider({
            baseUrl: 'http://context.test/api/context',
            fetchImpl: async () => new Response(JSON.stringify({
                nodes: [],
                agentConfigs: {}
            }), {
                status: 200
            })
        });

        await expect(provider.getContext()).resolves.toEqual({
            nodes: [],
            agentConfigs: {}
        });
    });

    it('returns parsed project document payloads', async () => {
        const provider = new HttpContextProvider({
            baseUrl: 'http://context.test/api/context',
            fetchImpl: async () => new Response(JSON.stringify({
                documents: [{ path: '/docs/guide.md', name: 'guide.md' }]
            }), {
                status: 200
            })
        });

        await expect(provider.getProjectDocuments('/docs')).resolves.toEqual([
            { path: '/docs/guide.md', name: 'guide.md' }
        ]);
    });

    it('normalizes non-2xx errors into HttpApiError', async () => {
        const provider = new HttpContextProvider({
            baseUrl: 'http://context.test/api/context',
            fetchImpl: async () => new Response(JSON.stringify({
                error: 'Failed to read document.',
                code: 'CONTEXT_READ_DOCUMENT_FAILED'
            }), {
                status: 400
            })
        });

        await expect(provider.readDocument('/guide.md')).rejects.toMatchObject({
            name: 'HttpApiError',
            message: 'Failed to read document.',
            status: 400,
            code: 'CONTEXT_READ_DOCUMENT_FAILED',
            source: 'context'
        } satisfies Partial<HttpApiError>);
    });
});
