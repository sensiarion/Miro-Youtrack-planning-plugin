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

// Storage: token only in localStorage (user-side); board settings in Miro board storage
export const STORAGE_KEYS = {
  TOKEN: 'youtrack-plan-mindmap:token',
} as const;

export const MIRO_BOARD_COLLECTION = 'youtrack-sync' as const;
