import { useSyncExternalStore } from 'react';

import {
  defaultCardFilters,
  type CardFilters,
  type ViewMode,
} from '@/lib/queries';

type CollectionView = 'owned' | 'missing' | 'all';

interface BrowserState {
  filters: CardFilters;
  numColumns: number;
  viewMode: ViewMode;
  collectionView: CollectionView;
  hideComplete: boolean;
  /** Collapsed domain bands, keyed `${setId}_${bandKey}`; shared by grid and list */
  collapsedBands: Record<string, boolean>;
}

let state: BrowserState = {
  filters: defaultCardFilters,
  numColumns: 6,
  viewMode: 'grid',
  collectionView: 'owned',
  hideComplete: false,
  collapsedBands: {},
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

export function setCollectionView(collectionView: CollectionView) {
  state = { ...state, collectionView };
  emitChange();
}

export function setHideComplete(hideComplete: boolean) {
  state = { ...state, hideComplete };
  emitChange();
}

export function toggleBandCollapsed(key: string) {
  const collapsedBands = { ...state.collapsedBands };
  if (collapsedBands[key]) delete collapsedBands[key];
  else collapsedBands[key] = true;
  state = { ...state, collapsedBands };
  emitChange();
}

export function useBrowserState() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    filters: snapshot.filters,
    numColumns: snapshot.numColumns,
    viewMode: snapshot.viewMode,
    collectionView: snapshot.collectionView,
    hideComplete: snapshot.hideComplete,
    collapsedBands: snapshot.collapsedBands,
    setFilters,
    setNumColumns,
    setViewMode,
    setCollectionView,
    setHideComplete,
    toggleBandCollapsed,
  };
}
