import { STORAGE_KEYS, MIRO_BOARD_COLLECTION } from './constants';

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

const BOARD_KEYS = {
  youtrackBaseUrl: 'youtrackBaseUrl',
  taskQuery: 'taskQuery',
  syncQuery: 'syncQuery',
  statusFieldName: 'statusFieldName',
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
    const [baseUrl, taskQuery, syncQuery, statusFieldName] = await Promise.all([
      coll.get<string>(BOARD_KEYS.youtrackBaseUrl),
      coll.get<string>(BOARD_KEYS.taskQuery),
      coll.get<string>(BOARD_KEYS.syncQuery),
      coll.get<string>(BOARD_KEYS.statusFieldName),
    ]);
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN) ?? '';
    return {
      ...DEFAULT_SETTINGS,
      youtrackBaseUrl: baseUrl ?? DEFAULT_SETTINGS.youtrackBaseUrl,
      youtrackToken: token,
      taskQuery: taskQuery ?? DEFAULT_SETTINGS.taskQuery,
      syncQuery: syncQuery ?? DEFAULT_SETTINGS.syncQuery,
      statusFieldName: statusFieldName ?? DEFAULT_SETTINGS.statusFieldName,
    };
  } catch (e) {
    console.error('Failed to load settings:', e);
    return {
      ...DEFAULT_SETTINGS,
      youtrackToken: localStorage.getItem(STORAGE_KEYS.TOKEN) ?? '',
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
