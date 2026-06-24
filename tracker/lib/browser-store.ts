import { useSyncExternalStore } from 'react';

import {
  defaultCardFilters,
  type CardFilters,
  type ViewMode,
} from '@/lib/queries';

interface BrowserState {
  filters: CardFilters;
  numColumns: number;
  viewMode: ViewMode;
}

let state: BrowserState = {
  filters: defaultCardFilters,
  numColumns: 6,
  viewMode: 'grid',
};

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): BrowserState {
  return state;
}

export function setFilters(filters: CardFilters) {
  state = { ...state, filters };
  emitChange();
}

export function setNumColumns(numColumns: number) {
  state = { ...state, numColumns };
  emitChange();
}

export function setViewMode(viewMode: ViewMode) {
  state = { ...state, viewMode };
  emitChange();
}

export function useBrowserState() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    filters: snapshot.filters,
    numColumns: snapshot.numColumns,
    viewMode: snapshot.viewMode,
    setFilters,
    setNumColumns,
    setViewMode,
  };
}
