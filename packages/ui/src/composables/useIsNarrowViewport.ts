import { getCurrentInstance, onBeforeUnmount, ref, type Ref } from 'vue';

export const NARROW_VIEWPORT_QUERY = '(max-width: 767px)';

/**
 * Reactive flag for narrow (mobile-like) viewports. Falls back to `false`
 * in environments without matchMedia (SSR, happy-dom test runs).
 */
export function useIsNarrowViewport(query: string = NARROW_VIEWPORT_QUERY): Ref<boolean> {
    const isNarrow = ref(false);
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return isNarrow;
    }

    const mediaQueryList = window.matchMedia(query);
    isNarrow.value = mediaQueryList.matches;
    const onChange = (event: MediaQueryListEvent) => {
        isNarrow.value = event.matches;
    };
    mediaQueryList.addEventListener('change', onChange);
    if (getCurrentInstance()) {
        onBeforeUnmount(() => mediaQueryList.removeEventListener('change', onChange));
    }

    return isNarrow;
}
