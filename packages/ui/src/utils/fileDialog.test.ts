// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { openSingleFileDialog } from './fileDialog';

function setDisplayMode(standalone: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
        matches: standalone && query.includes('display-mode: standalone'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false
    }) as unknown as MediaQueryList);
}

afterEach(() => {
    vi.unstubAllGlobals();
    // 清理可能残留的隐藏 input
    document.body.querySelectorAll('input[type="file"]').forEach((node) => node.remove());
});

describe('openSingleFileDialog', () => {
    it('uses showOpenFilePicker when running as an installed standalone PWA', async () => {
        setDisplayMode(true);
        const file = new File(['x'], 'picked.pdf', { type: 'application/pdf' });
        const getFile = vi.fn(async () => file);
        const showOpenFilePicker = vi.fn(async () => [{ getFile }]);
        vi.stubGlobal('showOpenFilePicker', showOpenFilePicker);

        const result = await openSingleFileDialog();

        expect(showOpenFilePicker).toHaveBeenCalledTimes(1);
        expect(result).toBe(file);
    });

    it('returns null without falling back to <input> when the user cancels the picker', async () => {
        setDisplayMode(true);
        const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
        const showOpenFilePicker = vi.fn(async () => { throw abortError; });
        vi.stubGlobal('showOpenFilePicker', showOpenFilePicker);
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

        const result = await openSingleFileDialog();

        expect(result).toBeNull();
        expect(clickSpy).not.toHaveBeenCalled();
        clickSpy.mockRestore();
    });

    it('falls back to a hidden <input> in a normal browser tab', async () => {
        setDisplayMode(false);
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
            queueMicrotask(() => this.dispatchEvent(new Event('cancel')));
        });

        const result = await openSingleFileDialog();

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(result).toBeNull();
        clickSpy.mockRestore();
    });
});
