import { defineComponent, h } from 'vue';

function toKebabCase(value: string): string {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
        .replace(/([a-zA-Z])([0-9]+)/g, '$1-$2')
        .toLowerCase();
}

function createIcon(name: string) {
    return defineComponent({
        name,
        setup(_, { attrs }) {
            const iconClass = `lucide-${toKebabCase(name)}`;
            return () => h('svg', {
                ...attrs,
                class: [attrs.class, 'lucide', iconClass]
            });
        }
    });
}

export const Archive = createIcon('Archive');
export const ArrowLeft = createIcon('ArrowLeft');
export const ArrowUp = createIcon('ArrowUp');
export const Bot = createIcon('Bot');
export const ChevronDown = createIcon('ChevronDown');
export const ChevronLeft = createIcon('ChevronLeft');
export const ChevronRight = createIcon('ChevronRight');
export const Eye = createIcon('Eye');
export const FileJson2 = createIcon('FileJson2');
export const FilePlus = createIcon('FilePlus');
export const FileText = createIcon('FileText');
export const Files = createIcon('Files');
export const FileType2 = createIcon('FileType2');
export const FolderPlus = createIcon('FolderPlus');
export const Image = createIcon('Image');
export const Link2 = createIcon('Link2');
export const Maximize2 = createIcon('Maximize2');
export const MessageSquareQuote = createIcon('MessageSquareQuote');
export const Minimize2 = createIcon('Minimize2');
export const PanelLeftOpen = createIcon('PanelLeftOpen');
export const PanelRightOpen = createIcon('PanelRightOpen');
export const PanelTopOpen = createIcon('PanelTopOpen');
export const PencilLine = createIcon('PencilLine');
export const Plus = createIcon('Plus');
export const RefreshCw = createIcon('RefreshCw');
export const Save = createIcon('Save');
export const SquarePen = createIcon('SquarePen');
export const Trash2 = createIcon('Trash2');
