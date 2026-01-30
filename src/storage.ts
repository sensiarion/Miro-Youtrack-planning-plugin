import { STORAGE_KEYS, MIRO_BOARD_COLLECTION } from './constants';

export interface Settings {
  youtrackBaseUrl: string;
  youtrackToken: string;
  taskQuery: string;
  syncQuery: string;
  statusFieldName: string;
  /** State name → hex color (board-specific; populated by sync, editable in Settings) */
  stateColors: Record<string, string>;
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
  stateColors: {},
};

const DEFAULT_SYNC_STATE: SyncState = {
  lastSyncAt: null,
  foundIssueCount: 0,
  updatedOnBoardCount: 0,
  createdInNotFoundCount: 0,
};

const BOARD_KEYS = {
  youtrackBaseUrl: 'youtrackBaseUrl',
  taskQuery: 'taskQuery',
  syncQuery: 'syncQuery',
  statusFieldName: 'statusFieldName',
  stateColors: 'stateColors',
  syncState: 'syncState',
} as const;

function getBoardCollection() {
  return miro.board.storage.collection(MIRO_BOARD_COLLECTION);
}

/**
 * Load settings: board-specific from Miro board storage, token from localStorage (user-side only).
 */
export async function loadSettings(): Promise<Settings> {
  try {
    const coll = getBoardCollection();
    const [baseUrl, taskQuery, syncQuery, statusFieldName, stateColors] = await Promise.all([
      coll.get<string>(BOARD_KEYS.youtrackBaseUrl),
      coll.get<string>(BOARD_KEYS.taskQuery),
      coll.get<string>(BOARD_KEYS.syncQuery),
      coll.get<string>(BOARD_KEYS.statusFieldName),
      coll.get<Record<string, string>>(BOARD_KEYS.stateColors),
    ]);
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN) ?? '';
    return {
      ...DEFAULT_SETTINGS,
      youtrackBaseUrl: baseUrl ?? DEFAULT_SETTINGS.youtrackBaseUrl,
      youtrackToken: token,
      taskQuery: taskQuery ?? DEFAULT_SETTINGS.taskQuery,
      syncQuery: syncQuery ?? DEFAULT_SETTINGS.syncQuery,
      statusFieldName: statusFieldName ?? DEFAULT_SETTINGS.statusFieldName,
      stateColors: stateColors ?? DEFAULT_SETTINGS.stateColors,
    };
  } catch (e) {
    console.error('Failed to load settings:', e);
    return {
      ...DEFAULT_SETTINGS,
      youtrackToken: localStorage.getItem(STORAGE_KEYS.TOKEN) ?? '',
      stateColors: {},
    };
  }
}

/**
 * Save settings: token → localStorage; youtrackBaseUrl, taskQuery, syncQuery, statusFieldName → Miro board storage.
 */
export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  try {
    if (settings.youtrackToken !== undefined) {
      localStorage.setItem(STORAGE_KEYS.TOKEN, settings.youtrackToken);
    }
    const coll = getBoardCollection();
    const boardUpdates: Promise<void>[] = [];
    if (settings.youtrackBaseUrl !== undefined) {
      boardUpdates.push(coll.set(BOARD_KEYS.youtrackBaseUrl, settings.youtrackBaseUrl));
    }
    if (settings.taskQuery !== undefined) {
      boardUpdates.push(coll.set(BOARD_KEYS.taskQuery, settings.taskQuery));
    }
    if (settings.syncQuery !== undefined) {
      boardUpdates.push(coll.set(BOARD_KEYS.syncQuery, settings.syncQuery));
    }
    if (settings.statusFieldName !== undefined) {
      boardUpdates.push(coll.set(BOARD_KEYS.statusFieldName, settings.statusFieldName));
    }
    if (settings.stateColors !== undefined) {
      boardUpdates.push(coll.set(BOARD_KEYS.stateColors, settings.stateColors));
    }
    await Promise.all(boardUpdates);
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

/**
 * Load sync state from Miro board storage.
 */
export async function loadSyncState(): Promise<SyncState> {
  try {
    const coll = getBoardCollection();
    const stored = await coll.get<SyncState>(BOARD_KEYS.syncState);
    if (stored && typeof stored === 'object') {
      return { ...DEFAULT_SYNC_STATE, ...stored };
    }
  } catch (e) {
    console.error('Failed to load sync state:', e);
  }
  return { ...DEFAULT_SYNC_STATE };
}

/**
 * Save sync state to Miro board storage.
 */
export async function saveSyncState(state: SyncState): Promise<void> {
  try {
    const coll = getBoardCollection();
    await coll.set(BOARD_KEYS.syncState, state);
  } catch (e) {
    console.error('Failed to save sync state:', e);
  }
}
