// Task state colors and styling constants
export const TASK_COLORS = {
  PLANNING: '#FFF6B6', // Yellow
  IN_WORK: '#ADF0C7',  // Green
  DONE: '#DEDAFF',     // Purple
} as const;

/**
 * Default colors by original (non-localized) state name from YouTrack.
 * Used when no user setting is specified. Keys are internal/API state names.
 * Add your YouTrack internal state names here (e.g. "StateProjectCustomField: Completed") to get consistent defaults.
 */
export const DEFAULT_STATE_COLORS: Record<string, string> = {
  // Planning / backlog
  Planning: TASK_COLORS.PLANNING,
  Todo: TASK_COLORS.PLANNING,
  Backlog: TASK_COLORS.PLANNING,
  Open: TASK_COLORS.PLANNING,
  // In progress / to verify
  'In Progress': TASK_COLORS.IN_WORK,
  'In Work': TASK_COLORS.IN_WORK,
  'To Verify': TASK_COLORS.IN_WORK,
  'On Desk': TASK_COLORS.IN_WORK,
  Fixed: TASK_COLORS.IN_WORK,
  // Done / resolved
  Done: TASK_COLORS.DONE,
  Resolved: TASK_COLORS.DONE,
  Completed: TASK_COLORS.DONE,
  // YouTrack custom field style (internal name as returned by API)
  'StateProjectCustomField: Completed': TASK_COLORS.DONE,
  'StateProjectCustomField: In Progress': TASK_COLORS.IN_WORK,
  'StateProjectCustomField: To Verify': TASK_COLORS.IN_WORK,
  'StateProjectCustomField: Open': TASK_COLORS.PLANNING,
};

/** Palette of hex colors for user-selectable state colors (Settings tab) */
export const STATE_COLOR_PALETTE = [
  TASK_COLORS.PLANNING,
  TASK_COLORS.IN_WORK,
  TASK_COLORS.DONE,
  '#FFE4E1', // Misty Rose
  '#D3D3D3', // Light gray
] as const;

export const TASK_FILL_OPACITY = 0.7; // Default transparency

// Metadata key for identifying plugin-managed task shapes
export const METADATA_KEY = 'youtrack-task';

// Default dimensions for task shapes
export const TASK_SHAPE_WIDTH = 200;
export const TASK_SHAPE_HEIGHT = 100;

// Frame title for "Not found" items
export const NOT_FOUND_FRAME_TITLE = 'Not found';

// localStorage keys: URL plain, token XOR-obfuscated. Per-user, persist across boards.
export const LOCAL_STORAGE_KEYS = {
  URL: 'youtrack-plan-mindmap:url',
  TOKEN: 'youtrack-plan-mindmap:token',
  LAST_PROJECT: 'youtrack-plan-mindmap:lastProject',
} as const;

// XOR key for cheap token obfuscation (NOT security; just hides from casual DevTools peek)
export const TOKEN_OBFUSCATION_KEY = 'yt-mm-v1-xor';
export const OBFUSCATED_TOKEN_PREFIX = 'xor1:';

export const MIRO_BOARD_COLLECTION = 'youtrack-sync' as const;

// Sync concurrency
export const DEFAULT_SYNC_CONCURRENCY = 3;
export const MIN_SYNC_CONCURRENCY = 1;
export const MAX_SYNC_CONCURRENCY = 10;

// Connector styles
export type ConnectorStrokeStyle = 'normal' | 'dashed' | 'dotted';
export type ConnectorEndCap = 'none' | 'stealth' | 'filled_arrow' | 'rounded_stealth';

export interface ConnectorStyle {
  strokeStyle: ConnectorStrokeStyle;
  endStrokeCap: ConnectorEndCap;
  strokeColor: string; // hex
  strokeWidth: number; // 1–4
}

export const DEFAULT_CONNECTOR_STYLE: ConnectorStyle = {
  strokeStyle: 'dashed',
  endStrokeCap: 'none',
  strokeColor: '#1a1a1a',
  strokeWidth: 2,
};

export const CONNECTOR_STROKE_STYLE_OPTIONS: { value: ConnectorStrokeStyle; label: string }[] = [
  { value: 'normal', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];

export const CONNECTOR_END_CAP_OPTIONS: { value: ConnectorEndCap; label: string }[] = [
  { value: 'none', label: 'No arrow' },
  { value: 'stealth', label: 'Stealth' },
  { value: 'filled_arrow', label: 'Filled arrow' },
  { value: 'rounded_stealth', label: 'Rounded' },
];

export const CONNECTOR_COLOR_PALETTE = [
  '#1a1a1a', // black
  '#6b7280', // gray
  '#2563eb', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#d97706', // orange
  '#9333ea', // purple
] as const;
