import { describe, expect, it } from 'vitest';
import { HttpContextProvider } from '@packages/ui';
import { createWeb2ContextProvider, resolveContextBaseUrl } from './createWeb2ContextProvider';

describe('createWeb2ContextProvider', () => {
    it('derives the context base url from the explicit env or sync base url', () => {
        expect(resolveContextBaseUrl({
            VITE_CONTEXT_BASE_URL: 'https://context.example.com/api/context/'
        })).toBe('https://context.example.com/api/context');

        expect(resolveContextBaseUrl({
            VITE_SYNC_BASE_URL: 'https://sync.example.com/api/sync/'
        })).toBe('https://sync.example.com/api/context');
    });

    it('creates an HttpContextProvider with the resolved base url', () => {
        const provider = createWeb2ContextProvider({
            env: {
                VITE_CONTEXT_BASE_URL: 'https://context.example.com/api/context/'
            }
        });

        expect(provider).toBeInstanceOf(HttpContextProvider);
    });
});
