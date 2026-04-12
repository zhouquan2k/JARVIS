import { Crepe, CrepeFeature, type CrepeConfig } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';
import { translateWorkspaceMessage } from '../i18n';

export type MarkdownEditor = Crepe;

export interface CreateMarkdownEditorOptions {
    root: HTMLElement;
    content: string;
    onChange: (markdown: string) => void;
}

const ENABLED_FEATURES: NonNullable<CrepeConfig['features']> = {
    [CrepeFeature.BlockEdit]: false,
    [CrepeFeature.CodeMirror]: true,
    [CrepeFeature.Cursor]: true,
    [CrepeFeature.ImageBlock]: false,
    [CrepeFeature.Latex]: false,
    [CrepeFeature.LinkTooltip]: false,
    [CrepeFeature.ListItem]: false,
    [CrepeFeature.Placeholder]: true,
    [CrepeFeature.Table]: false,
    [CrepeFeature.Toolbar]: false
};

export async function createMarkdownEditor(options: CreateMarkdownEditorOptions): Promise<MarkdownEditor> {
    const editor = new Crepe({
        root: options.root,
        defaultValue: options.content,
        features: ENABLED_FEATURES,
        featureConfigs: {
            [CrepeFeature.Placeholder]: {
                mode: 'doc',
                text: translateWorkspaceMessage('shared.startMarkdownDraft')
            }
        }
    });
    editor.on((listener) => {
        listener.markdownUpdated((_ctx, markdown) => {
            options.onChange(markdown);
        });
    });

    await editor.create();
    attachEditorTestIds(options.root);
    return editor;
}

export function replaceMarkdownDocument(editor: MarkdownEditor, content: string) {
    editor.editor.action(replaceAll(content, true));
}

export function readMarkdownDocument(editor: MarkdownEditor): string {
    return editor.getMarkdown();
}

export async function destroyMarkdownEditor(editor: MarkdownEditor | null | undefined) {
    if (!editor) {
        return;
    }

    await editor.destroy();
}

export function attachEditorTestIds(root: HTMLElement) {
    const editable = root.querySelector<HTMLElement>('[contenteditable="true"]');
    if (editable) {
        editable.dataset.testid = 'document-editor-input';
    }
}
