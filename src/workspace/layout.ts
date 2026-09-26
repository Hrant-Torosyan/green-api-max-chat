import { useSyncExternalStore } from 'react';

// The only place the breakpoint is defined; CSS follows the data-layout attribute set from it.
const SINGLE_PANE_QUERY = '(max-width: 767px)';

export function isSinglePaneLayout(): boolean {
  return window.matchMedia(SINGLE_PANE_QUERY).matches;
}

function subscribe(onChange: () => void) {
  const query = window.matchMedia(SINGLE_PANE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useSinglePaneLayout(): boolean {
  return useSyncExternalStore(subscribe, isSinglePaneLayout);
}
