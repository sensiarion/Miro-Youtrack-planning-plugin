import {
  LOCAL_STORAGE_KEYS,
  MIRO_BOARD_COLLECTION,
  TOKEN_OBFUSCATION_KEY,
  OBFUSCATED_TOKEN_PREFIX,
  DEFAULT_SYNC_CONCURRENCY,
  type ConnectorStyle,
} from './constants';

export interface Settings {
  youtrackBaseUrl: string;
  youtrackToken: string;
  taskQuery: string;
  syncQuery: string;
  statusFieldName: string;
  /** State name → hex color (board-specific; populated by sync, editable in Settings) */
  stateColors: Record<string, string>;
  /** YouTrack link type name → connector style override (board-specific) */
  connectorStyles: Record<string, ConnectorStyle>;
  /** YouTrack link type name → localized display name (informational, populated by sync) */
  connectorLinkLabels: Record<string, string>;
  /** Sync concurrency (1–10) */
  concurrency: number;
  /** If true, sync removes plugin-managed cards whose issue is not in current sync results */
  deleteMissingOnSync: boolean;
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
  connectorStyles: {},
  connectorLinkLabels: {},
  concurrency: DEFAULT_SYNC_CONCURRENCY,
  deleteMissingOnSync: false,
};

const DEFAULT_SYNC_STATE: SyncState = {
  lastSyncAt: null,
  foundIssueCount: 0,
  updatedOnBoardCount: 0,
  createdInNotFoundCount: 0,
};

const BOARD_KEYS = {
  taskQuery: 'taskQuery',
  syncQuery: 'syncQuery',
  statusFieldName: 'statusFieldName',
  stateColors: 'stateColors',
  connectorStyles: 'connectorStyles',
  connectorLinkLabels: 'connectorLinkLabels',
  concurrency: 'concurrency',
  deleteMissingOnSync: 'deleteMissingOnSync',
  syncState: 'syncState',
} as const;

function getBoardCollection() {
  return miro.board.storage.collection(MIRO_BOARD_COLLECTION);
}

const BOARD_READ_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out reading board storage: ${label}`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function xorString(input: string, key: string): string {
  if (!key) return input;
  const out = new Array<string>(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out.join('');
}

function utf8ToB64(str: string): string {
  // btoa needs binary-safe input. Encode UTF-8 first.
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Normalize a YouTrack base URL: trim, default to https:// when scheme missing, drop trailing slash. */
export function normalizeBaseUrl(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

export function obfuscateToken(plain: string): string {
  if (!plain) return '';
  return OBFUSCATED_TOKEN_PREFIX + utf8ToB64(xorString(plain, TOKEN_OBFUSCATION_KEY));
}

/**
 * Synchronous read of URL + token from localStorage. Use this to surface credentials
 * immediately on app start, without waiting on Miro board storage IO.
 */
export function loadLocalCredentials(): { youtrackBaseUrl: string; youtrackToken: string } {
  const localUrl = localStorage.getItem(LOCAL_STORAGE_KEYS.URL) ?? '';
  const localTokenRaw = localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN) ?? '';
  return {
    youtrackBaseUrl: localUrl,
    youtrackToken: deobfuscateToken(localTokenRaw),
  };
}

export function deobfuscateToken(stored: string): string {
  if (!stored || !stored.startsWith(OBFUSCATED_TOKEN_PREFIX)) return '';
  return xorString(b64ToUtf8(stored.slice(OBFUSCATED_TOKEN_PREFIX.length)), TOKEN_OBFUSCATION_KEY);
}

/**
 * Load settings: URL + token from localStorage; queries, colors, connector styles, etc. from board storage.
 */
export async function loadSettings(): Promise<Settings> {
  const { youtrackBaseUrl, youtrackToken } = loadLocalCredentials();

  try {
    const coll = getBoardCollection();
    const [
      taskQuery,
      syncQuery,
      statusFieldName,
      stateColors,
      connectorStyles,
      connectorLinkLabels,
      concurrency,
      deleteMissingOnSync,
    ] = await withTimeout(
      Promise.all([
        coll.get<string>(BOARD_KEYS.taskQuery),
        coll.get<string>(BOARD_KEYS.syncQuery),
        coll.get<string>(BOARD_KEYS.statusFieldName),
        coll.get<Record<string, string>>(BOARD_KEYS.stateColors),
        coll.get(BOARD_KEYS.connectorStyles) as Promise<Record<string, ConnectorStyle> | undefined>,
        coll.get<Record<string, string>>(BOARD_KEYS.connectorLinkLabels),
        coll.get<number>(BOARD_KEYS.concurrency),
        coll.get<boolean>(BOARD_KEYS.deleteMissingOnSync),
      ]),
      BOARD_READ_TIMEOUT_MS,
      'settings',
    );

    return {
      ...DEFAULT_SETTINGS,
      youtrackBaseUrl,
      youtrackToken,
      taskQuery: taskQuery ?? DEFAULT_SETTINGS.taskQuery,
      syncQuery: syncQuery ?? DEFAULT_SETTINGS.syncQuery,
      statusFieldName: statusFieldName ?? DEFAULT_SETTINGS.statusFieldName,
      stateColors: stateColors ?? DEFAULT_SETTINGS.stateColors,
      connectorStyles: connectorStyles ?? DEFAULT_SETTINGS.connectorStyles,
      connectorLinkLabels: connectorLinkLabels ?? DEFAULT_SETTINGS.connectorLinkLabels,
      concurrency:
        typeof concurrency === 'number' && concurrency > 0
          ? concurrency
          : DEFAULT_SETTINGS.concurrency,
      deleteMissingOnSync:
        typeof deleteMissingOnSync === 'boolean'
          ? deleteMissingOnSync
          : DEFAULT_SETTINGS.deleteMissingOnSync,
    };
  } catch (e) {
    console.error('Failed to load settings:', e);
    return { ...DEFAULT_SETTINGS, youtrackBaseUrl, youtrackToken };
  }
}

/**
 * Save settings: URL + token → localStorage (token obfuscated); rest → Miro board storage.
 */
export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  try {
    if (settings.youtrackBaseUrl !== undefined) {
      const normalized = normalizeBaseUrl(settings.youtrackBaseUrl);
      localStorage.setItem(LOCAL_STORAGE_KEYS.URL, normalized);
      // Reflect normalization back so caller refs stay in sync
      settings.youtrackBaseUrl = normalized;
    }
    if (settings.youtrackToken !== undefined) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.TOKEN, obfuscateToken(settings.youtrackToken));
    }
    const coll = getBoardCollection();
    const boardUpdates: Promise<unknown>[] = [];
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
    if (settings.connectorStyles !== undefined) {
      boardUpdates.push(coll.set(BOARD_KEYS.connectorStyles, settings.connectorStyles as any));
    }
    if (settings.connectorLinkLabels !== undefined) {
      boardUpdates.push(coll.set(BOARD_KEYS.connectorLinkLabels, settings.connectorLinkLabels));
    }
    if (settings.concurrency !== undefined) {
      boardUpdates.push(coll.set(BOARD_KEYS.concurrency, settings.concurrency));
    }
    if (settings.deleteMissingOnSync !== undefined) {
      boardUpdates.push(coll.set(BOARD_KEYS.deleteMissingOnSync, settings.deleteMissingOnSync));
    }
    if (boardUpdates.length > 0) {
      try {
        await withTimeout(Promise.all(boardUpdates), BOARD_READ_TIMEOUT_MS, 'save settings');
      } catch (timeoutErr) {
        console.warn('Board settings save timed out:', timeoutErr);
      }
    }
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
    const stored = (await coll.get(BOARD_KEYS.syncState)) as SyncState | undefined;
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
    await coll.set(BOARD_KEYS.syncState, state as any);
  } catch (e) {
    console.error('Failed to save sync state:', e);
  }
}
