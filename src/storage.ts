import { STORAGE_KEYS } from './constants';

export interface Settings {
  youtrackBaseUrl: string;
  youtrackToken: string;
  taskQuery: string;
  syncQuery: string;
  statusFieldName: string;
}

export interface SyncState {
  lastSyncAt: string | null;
  foundIssueCount: number;
  updatedOnBoardCount: number;
  createdInNotFoundCount: number;
}

const DEFAULT_SETTINGS: Settings = {
  youtrackBaseUrl: '',
  youtrackToken: '',
  taskQuery: '',
  syncQuery: '',
  statusFieldName: 'State',
};

const DEFAULT_SYNC_STATE: SyncState = {
  lastSyncAt: null,
  foundIssueCount: 0,
  updatedOnBoardCount: 0,
  createdInNotFoundCount: 0,
};

export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: Partial<Settings>): void {
  try {
    const current = loadSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export function loadSyncState(): SyncState {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SYNC_STATE);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load sync state:', e);
  }
  return { ...DEFAULT_SYNC_STATE };
}

export function saveSyncState(state: SyncState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SYNC_STATE, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save sync state:', e);
  }
}
