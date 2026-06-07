export interface OpenSingleFileDialogOptions {
    accept?: string;
}

interface FileSystemFileHandleLike {
    getFile: () => Promise<File>;
}

type ShowOpenFilePicker = (options?: { multiple?: boolean }) => Promise<FileSystemFileHandleLike[]>;

/**
 * 判断当前是否运行在已安装 PWA 的独立窗口（standalone）形态。
 * Chromium 在 standalone 窗口下，对程序化点击隐藏 <input type=file> 唤起原生文件框
 * 存在已知差异（浏览器标签页正常、独立窗口不弹），需要改用 File System Access API。
 */
function isStandaloneDisplayMode(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }
    try {
        if (window.matchMedia?.('(display-mode: standalone)').matches) {
            return true;
        }
        if (window.matchMedia?.('(display-mode: minimal-ui)').matches) {
            return true;
        }
    } catch {
        // matchMedia 不可用时忽略，回退到 input 方案
    }
    // iOS Safari 的私有标记
    return (window.navigator as { standalone?: boolean }).standalone === true;
}

type FileSystemAccessResult =
    | { handled: true; file: File | null }
    | { handled: false };

async function openViaFileSystemAccess(): Promise<FileSystemAccessResult> {
    const showOpenFilePicker = (window as unknown as { showOpenFilePicker?: ShowOpenFilePicker }).showOpenFilePicker;
    if (typeof showOpenFilePicker !== 'function') {
        return { handled: false };
    }

    try {
        console.log('[file-dialog] using showOpenFilePicker (standalone PWA)');
        const handles = await showOpenFilePicker({ multiple: false });
        const handle = handles?.[0];
        if (!handle) {
            return { handled: true, file: null };
        }
        return { handled: true, file: await handle.getFile() };
    } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') {
            console.log('[file-dialog] showOpenFilePicker cancelled');
            // 用户主动取消：视为已处理，不再弹出 <input> 兜底框。
            return { handled: true, file: null };
        }
        console.warn('[file-dialog] showOpenFilePicker failed, falling back to <input>', error);
        return { handled: false };
    }
}

function openViaHiddenInput(options: OpenSingleFileDialogOptions): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        // 使用仓库内已验证可用的隐藏方式（display:none）。
        input.style.display = 'none';
        if (options.accept) {
            input.accept = options.accept;
        }

        const cleanup = () => {
            input.remove();
        };

        input.addEventListener('change', () => {
            const file = input.files?.[0] ?? null;
            console.log('[file-dialog] change fired', { hasFile: !!file, fileName: file?.name ?? null });
            cleanup();
            resolve(file);
        }, { once: true });

        input.addEventListener('cancel', () => {
            console.log('[file-dialog] cancel fired');
            cleanup();
            resolve(null);
        }, { once: true });

        document.body.appendChild(input);
        try {
            console.log('[file-dialog] calling input.click()');
            input.click();
            console.log('[file-dialog] input.click() returned');
        } catch (error) {
            console.error('[file-dialog] input.click() threw', error);
            cleanup();
            resolve(null);
        }
    });
}

export async function openSingleFileDialog(options: OpenSingleFileDialogOptions = {}): Promise<File | null> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        console.warn('[file-dialog] window/document is undefined, cannot open file picker');
        return null;
    }

    // 仅在 standalone（已安装 PWA 独立窗口）下优先走 File System Access API；
    // 普通浏览器标签页仍走 <input>，以保持现有 Playwright filechooser e2e 与既有行为不变。
    if (isStandaloneDisplayMode()) {
        const result = await openViaFileSystemAccess();
        if (result.handled) {
            return result.file;
        }
        // showOpenFilePicker 不存在或非取消类失败时，仍尝试 <input> 兜底
    }

    return openViaHiddenInput(options);
}
